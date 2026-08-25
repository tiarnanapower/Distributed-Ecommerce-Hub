import Link from 'next/link';
import type { Metadata } from 'next';
import { Server } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { JobStatusBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { JOB_TYPE_LABELS, type JobType } from '@/lib/enums';
import { jobTypesForAction } from '@/lib/sync-jobs';
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import { RunSyncDialog } from './run-sync-dialog';

export const metadata: Metadata = { title: 'Sync Centre' };
export const dynamic = 'force-dynamic';

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; targets?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/sync');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  // Links elsewhere in the app arrive as /sync?action=catalog&targets=<ids>.
  // Those pre-select the dialog rather than starting anything on their own —
  // navigating to a URL should never enqueue work.
  const presetJobTypes = jobTypesForAction(params.action);
  const presetStoreIds = params.targets ? params.targets.split(',').filter(Boolean) : [];

  const [jobs, byStatus, byType, stores] = await Promise.all([
    prisma.syncJob.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: {
        initiatedBy: { select: { name: true } },
        source: { select: { name: true } },
        _count: { select: { targets: true, items: true } },
      },
    }),
    prisma.syncJob.groupBy({
      by: ['status'],
      where: { organisationId: scope.organisationId },
      _count: { _all: true },
    }),
    prisma.syncJob.groupBy({
      by: ['jobType'],
      where: { organisationId: scope.organisationId },
      _count: { _all: true },
    }),
    prisma.storeConnection.findMany({
      where: { ...tenantWhere(scope), deletedAt: null },
      orderBy: [{ isDemo: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        countryCode: true,
        healthStatus: true,
        isDemo: true,
        status: true,
      },
    }),
  ]);

  const count = (status: string) => byStatus.find((entry) => entry.status === status)?._count._all ?? 0;
  const inFlight = count('QUEUED') + count('RUNNING');
  const terminal = count('COMPLETED') + count('PARTIAL') + count('FAILED') + count('CANCELLED');
  const successRate = terminal > 0 ? (count('COMPLETED') / terminal) * 100 : null;

  return (
    <>
      <PageHeader
        title="Sync Centre"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Sync Centre' }]}
        description="Every background job, its progress and its per-item results."
        actions={
          <RunSyncDialog
            stores={stores.map((store) => ({
              id: store.id,
              name: store.name,
              countryCode: store.countryCode,
              healthStatus: store.healthStatus,
              isDemo: store.isDemo,
              isPlanned: store.status === 'PLANNED',
            }))}
            initialJobTypes={presetJobTypes}
            initialStoreIds={presetStoreIds}
            autoOpen={presetJobTypes.length > 0}
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="In flight" value={formatNumber(inFlight)} tone={inFlight > 0 ? 'warning' : 'default'} />
        <MetricCard label="Completed" value={formatNumber(count('COMPLETED'))} tone="success" />
        <MetricCard
          label="Partial"
          value={formatNumber(count('PARTIAL'))}
          tone={count('PARTIAL') > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Failed"
          value={formatNumber(count('FAILED'))}
          tone={count('FAILED') > 0 ? 'destructive' : 'default'}
        />
        <MetricCard
          label="Success rate"
          value={successRate !== null ? `${successRate.toFixed(1)}%` : '—'}
          unavailableReason={successRate === null ? 'No job has reached a terminal state yet.' : undefined}
        />
      </div>

      <InfoNote className="mb-6">
        <span className="font-medium">This is an in-process job runner.</span> Jobs are persisted to the
        database, batched, retried with exponential backoff, and re-queued if the server restarts mid-run. What
        it does not do is run while the Next.js process is stopped, or coordinate across several processes —
        for that, swap the local queue for a durable one. See docs/architecture.md.
      </InfoNote>

      {jobs.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No jobs yet"
          description="Comparisons, catalog pulls and deployments all appear here once they run."
        />
      ) : (
        <>
          {jobs.some((job) => job.status === 'RUNNING' || job.status === 'QUEUED') ? (
            <Section title="In flight">
              <div className="space-y-3">
                {jobs
                  .filter((job) => job.status === 'RUNNING' || job.status === 'QUEUED')
                  .map((job) => (
                    <Card key={job.id}>
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <CardTitle className="text-sm">
                            <Link href={`/sync/${job.id}`} className="hover:underline">
                              {JOB_TYPE_LABELS[job.jobType as JobType] ?? job.jobType}
                            </Link>
                          </CardTitle>
                          <JobStatusBadge status={job.status} />
                        </div>
                        <CardDescription>
                          {job._count.targets} target(s) · started {formatRelativeTime(job.startedAt)} ·{' '}
                          <code className="font-mono text-xs">{job.correlationId}</code>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Progress value={job.progressPercent} />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {job.progressPercent}% · {job.successCount} succeeded · {job.failureCount} failed ·{' '}
                          {job.skippedCount} skipped
                        </p>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </Section>
          ) : null}

          <Section
            title="Job history"
            description={
              byType.length > 0
                ? byType
                    .sort((a, b) => b._count._all - a._count._all)
                    .slice(0, 5)
                    .map((entry) => `${JOB_TYPE_LABELS[entry.jobType as JobType] ?? entry.jobType} ${entry._count._all}`)
                    .join(' · ')
                : undefined
            }
          >
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Targets</TableHead>
                    <TableHead className="text-right">Succeeded</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Retries</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Correlation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="max-w-sm">
                        <Link href={`/sync/${job.id}`} className="font-medium hover:underline">
                          {JOB_TYPE_LABELS[job.jobType as JobType] ?? job.jobType}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {job.isDryRun ? (
                            <Badge variant="info" size="sm">
                              Dry run
                            </Badge>
                          ) : null}
                          {job.source ? (
                            <span className="text-xs text-muted-foreground">from {job.source.name}</span>
                          ) : null}
                        </div>
                        {job.errorSummary ? (
                          <p className="mt-0.5 text-xs leading-relaxed text-destructive">{job.errorSummary}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <JobStatusBadge status={job.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">{job._count.targets}</TableCell>
                      <TableCell className="tabular text-right text-success">{job.successCount}</TableCell>
                      <TableCell className="tabular text-right">
                        <span className={job.failureCount > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                          {job.failureCount}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {job.retryCount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatRelativeTime(job.startedAt ?? job.createdAt)}
                        {job.initiatedBy ? <p>{job.initiatedBy.name}</p> : null}
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-xs text-muted-foreground">{job.correlationId}</code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
