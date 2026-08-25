/**
 * Local job runner.
 *
 * An in-process, database-persisted queue. It exists so background work
 * (comparison scans, dry-runs, analytics refreshes) survives a page navigation
 * without requiring Redis, Docker or a separate worker process.
 *
 * Production replacement path: `JobQueue` below is the only interface the
 * application uses. Swapping in BullMQ, SQS, Cloud Tasks or Vercel Queues means
 * implementing `enqueue` and running `executeJob` in the worker — the handlers
 * themselves are untouched. See docs/architecture.md.
 *
 * Properties the local runner does provide:
 *  * durability — every job, target and item is a database row;
 *  * batching, with a configurable batch size;
 *  * bounded retries with exponential backoff;
 *  * idempotency — handlers key their work on (jobId, resourceKey);
 *  * safe resumption — a job interrupted mid-run is re-queued on next start;
 *  * cancellation.
 *
 * What it does not provide, honestly: multi-process coordination, cross-region
 * durability, or execution while the Next.js process is not running.
 */
import { env } from '@/lib/config';
import { prisma } from '@/lib/db';
import { logger, newCorrelationId } from '@/lib/logger';
import { stringifyJson } from '@/lib/json';
import { redactString } from '@/lib/crypto/credentials';
import type { JobStatus, JobType } from '@/lib/enums';

export interface JobContext {
  jobId: string;
  correlationId: string;
  organisationId: string;
  parameters: Record<string, unknown>;
  isDryRun: boolean;
  /** Throws if the job has been cancelled. Handlers call this between batches. */
  checkCancelled: () => Promise<void>;
  /** Reports progress; persisted immediately so the UI can poll it. */
  reportProgress: (progress: {
    percent?: number;
    total?: number;
    success?: number;
    failure?: number;
    skipped?: number;
  }) => Promise<void>;
  log: ReturnType<typeof logger.child>;
}

export interface JobResult {
  status: Extract<JobStatus, 'COMPLETED' | 'PARTIAL' | 'FAILED'>;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  summary?: string;
  dryRunResult?: unknown;
}

export type JobHandler = (context: JobContext) => Promise<JobResult>;

export class JobCancelledError extends Error {
  constructor() {
    super('The job was cancelled.');
    this.name = 'JobCancelledError';
  }
}

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function hasJobHandler(type: JobType): boolean {
  return handlers.has(type);
}

export interface EnqueueInput {
  organisationId: string;
  companyId?: string | null;
  jobType: JobType;
  resourceCategory?: string | null;
  initiatedByUserId?: string | null;
  sourceConnectionId?: string | null;
  deploymentId?: string | null;
  isDryRun?: boolean;
  parameters?: Record<string, unknown>;
  targets?: { connectionId: string; channelId?: string | null }[];
  scheduledFor?: Date | null;
}

/** The seam a production queue would implement. */
export interface JobQueue {
  enqueue(input: EnqueueInput): Promise<{ jobId: string; correlationId: string }>;
  cancel(jobId: string): Promise<void>;
}

export class LocalJobQueue implements JobQueue {
  async enqueue(input: EnqueueInput): Promise<{ jobId: string; correlationId: string }> {
    const correlationId = newCorrelationId('job');

    const job = await prisma.syncJob.create({
      data: {
        organisationId: input.organisationId,
        companyId: input.companyId ?? null,
        jobType: input.jobType,
        status: 'QUEUED',
        resourceCategory: input.resourceCategory ?? null,
        correlationId,
        isDryRun: input.isDryRun ?? false,
        initiatedByUserId: input.initiatedByUserId ?? null,
        sourceConnectionId: input.sourceConnectionId ?? null,
        deploymentId: input.deploymentId ?? null,
        scheduledFor: input.scheduledFor ?? null,
        parametersJson: stringifyJson(input.parameters ?? {}),
        totalCount: input.targets?.length ?? 0,
        targets: input.targets
          ? {
              create: input.targets.map((target) => ({
                connectionId: target.connectionId,
                channelId: target.channelId ?? null,
                status: 'QUEUED',
              })),
            }
          : undefined,
      },
    });

    logger.info('Job enqueued', {
      correlationId,
      jobId: job.id,
      jobType: input.jobType,
      organisationId: input.organisationId,
    });

    // Nudge the runner so short jobs feel immediate rather than waiting a tick.
    void ensureRunnerStarted();
    return { jobId: job.id, correlationId };
  }

  async cancel(jobId: string): Promise<void> {
    await prisma.syncJob.updateMany({
      where: { id: jobId, status: { in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
  }
}

export const jobQueue: JobQueue = new LocalJobQueue();

// ---------------------------------------------------------------------------
// Runner loop
// ---------------------------------------------------------------------------

interface RunnerState {
  started: boolean;
  timer: NodeJS.Timeout | null;
  running: Set<string>;
}

const globalForRunner = globalThis as unknown as { __cccJobRunner?: RunnerState };

function state(): RunnerState {
  if (!globalForRunner.__cccJobRunner) {
    globalForRunner.__cccJobRunner = { started: false, timer: null, running: new Set() };
  }
  return globalForRunner.__cccJobRunner;
}

/**
 * Starts the polling loop once per process. Safe to call from anywhere; extra
 * calls are no-ops.
 */
export async function ensureRunnerStarted(): Promise<void> {
  const runner = state();
  if (runner.started || !env().JOB_RUNNER_ENABLED) return;
  runner.started = true;

  // A job left RUNNING means the process died mid-execution. Re-queue it: every
  // handler is idempotent on (jobId, resourceKey), so a repeat is safe.
  const recovered = await prisma.syncJob
    .updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'QUEUED', retryCount: { increment: 1 } },
    })
    .catch(() => ({ count: 0 }));

  if (recovered.count > 0) {
    logger.warn('Re-queued jobs interrupted by a restart', { count: recovered.count });
  }

  const tick = async () => {
    try {
      await drainOnce();
    } catch (error) {
      logger.error('Job runner tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  runner.timer = setInterval(() => void tick(), env().JOB_RUNNER_POLL_MS);
  // Do not hold the process open just for the queue.
  runner.timer.unref?.();
  void tick();

  logger.info('Local job runner started', { pollMs: env().JOB_RUNNER_POLL_MS });
}

export function stopRunner(): void {
  const runner = state();
  if (runner.timer) clearInterval(runner.timer);
  runner.timer = null;
  runner.started = false;
}

/** Claims and executes any due jobs. Exported so tests can drive it directly. */
export async function drainOnce(): Promise<number> {
  const runner = state();
  const now = new Date();

  const due = await prisma.syncJob.findMany({
    where: {
      status: 'QUEUED',
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
  });

  let executed = 0;
  for (const job of due) {
    if (runner.running.has(job.id)) continue;
    runner.running.add(job.id);
    try {
      await executeJob(job.id);
      executed += 1;
    } finally {
      runner.running.delete(job.id);
    }
  }
  return executed;
}

/**
 * Executes one job to completion. Exported so a production worker can call it
 * without the polling loop.
 */
export async function executeJob(jobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'QUEUED') return;

  const handler = handlers.get(job.jobType as JobType);
  const log = logger.child({ correlationId: job.correlationId, jobId: job.id });

  if (!handler) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorSummary: `No handler is registered for job type ${job.jobType}.`,
      },
    });
    log.error('Job has no registered handler', { jobType: job.jobType });
    return;
  }

  await prisma.syncJob.update({
    where: { id: job.id },
    data: { status: 'RUNNING', startedAt: new Date(), progressPercent: 0 },
  });

  const context: JobContext = {
    jobId: job.id,
    correlationId: job.correlationId,
    organisationId: job.organisationId,
    parameters: safeParse(job.parametersJson),
    isDryRun: job.isDryRun,
    log,
    checkCancelled: async () => {
      const current = await prisma.syncJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (current?.status === 'CANCELLED') throw new JobCancelledError();
    },
    reportProgress: async (progress) => {
      await prisma.syncJob
        .update({
          where: { id: job.id },
          data: {
            ...(progress.percent !== undefined
              ? { progressPercent: Math.max(0, Math.min(100, Math.round(progress.percent))) }
              : {}),
            ...(progress.total !== undefined ? { totalCount: progress.total } : {}),
            ...(progress.success !== undefined ? { successCount: progress.success } : {}),
            ...(progress.failure !== undefined ? { failureCount: progress.failure } : {}),
            ...(progress.skipped !== undefined ? { skippedCount: progress.skipped } : {}),
          },
        })
        .catch(() => undefined);
    },
  };

  try {
    const result = await handler(context);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: result.status,
        finishedAt: new Date(),
        progressPercent: 100,
        successCount: result.successCount,
        failureCount: result.failureCount,
        skippedCount: result.skippedCount,
        errorSummary: result.summary ? redactString(result.summary).slice(0, 500) : null,
        dryRunResultJson: result.dryRunResult ? stringifyJson(result.dryRunResult) : null,
      },
    });
    log.info('Job finished', { status: result.status, jobType: job.jobType });
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: 'CANCELLED', finishedAt: new Date() },
      });
      log.info('Job cancelled', { jobType: job.jobType });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = job.retryCount < 2 && isTransient(error);

    await prisma.syncJob.update({
      where: { id: job.id },
      data: shouldRetry
        ? {
            status: 'QUEUED',
            retryCount: { increment: 1 },
            errorSummary: redactString(message).slice(0, 500),
            // Exponential backoff before the next attempt.
            scheduledFor: new Date(Date.now() + 2 ** (job.retryCount + 1) * 5_000),
          }
        : {
            status: 'FAILED',
            finishedAt: new Date(),
            errorSummary: redactString(message).slice(0, 500),
          },
    });

    log.error('Job failed', { jobType: job.jobType, willRetry: shouldRetry });
  }
}

function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('rate') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('temporarily') ||
    message.includes('502') ||
    message.includes('503')
  );
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Batching helper
// ---------------------------------------------------------------------------

/**
 * Runs `work` over `items` in batches, checking for cancellation between each
 * and reporting progress. Failures are collected rather than aborting the run,
 * so a job reports partial success instead of losing everything.
 */
export async function processInBatches<T>(
  items: readonly T[],
  context: JobContext,
  work: (batch: T[], batchIndex: number) => Promise<{ success: number; failure: number; skipped: number }>,
  batchSize = env().JOB_RUNNER_BATCH_SIZE,
): Promise<{ success: number; failure: number; skipped: number }> {
  let success = 0;
  let failure = 0;
  let skipped = 0;

  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  await context.reportProgress({ total: items.length, percent: 0 });

  for (const [index, batch] of batches.entries()) {
    await context.checkCancelled();
    try {
      const outcome = await work(batch, index);
      success += outcome.success;
      failure += outcome.failure;
      skipped += outcome.skipped;
    } catch (error) {
      if (error instanceof JobCancelledError) throw error;
      failure += batch.length;
      context.log.warn('Batch failed', {
        batchIndex: index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await context.reportProgress({
      percent: ((index + 1) / batches.length) * 100,
      success,
      failure,
      skipped,
    });
  }

  return { success, failure, skipped };
}
