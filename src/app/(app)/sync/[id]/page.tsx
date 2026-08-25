import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { JobStatusBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { assertTenantAccess, scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import { JOB_TYPE_LABELS, type JobType } from '@/lib/enums';
import { formatDateTime, formatNumber, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Job' };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthOrRedirect(`/sync/${id}`);
  const scope = scopeFromAuth(auth);

  const job = await prisma.syncJob.findUnique({
    where: { id },
    include: {
      initiatedBy: { select: { name: true } },
      source: { select: { id: true, name: true } },
      deployment: { select: { id: true, name: true } },
      targets: { include: { connection: { select: { id: true, name: true } } } },
      items: { orderBy: [{ status: 'asc' }, { resourceKey: 'asc' }], take: 200 },
    },
  });

  if (!job) notFound();
  assertTenantAccess(job, scope, 'job');

  const parameters = parseJsonLoose<Record<string, unknown>>(job.parametersJson, {});
  const dryRunResult = job.dryRunResultJson
    ? parseJsonLoose<Record<string, unknown>>(job.dryRunResultJson, {})
    : null;

  const durationMs =
    job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null;

  return (
    <>
      <PageHeader
        title={JOB_TYPE_LABELS[job.jobType as JobType] ?? job.jobType}
        breadcrumbs={[
          { label: 'Operations' },
          { label: 'Sync Centre', href: '/sync' },
          { label: job.correlationId },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="font-mono text-xs">{job.correlationId}</code>
            {job.source ? (
              <>
                · source{' '}
                <Link href={`/stores/${job.source.id}`} className="hover:underline">
                  {job.source.name}
                </Link>
              </>
            ) : null}
            {job.initiatedBy ? <>· started by {job.initiatedBy.name}</> : null}
          </span>
        }
        meta={
          <>
            <JobStatusBadge status={job.status} />
            {job.isDryRun ? <Badge variant="info">Dry run</Badge> : null}
          </>
        }
      />

      {job.status === 'RUNNING' || job.status === 'QUEUED' ? (
        <Card className="mb-6">
          <CardContent className="p-5">
            <Progress value={job.progressPercent} />
            <p className="mt-2 text-sm text-muted-foreground">
              {job.progressPercent}% complete · {job.successCount} succeeded · {job.failureCount} failed
            </p>
          </CardContent>
        </Card>
      ) : null}

      {job.errorSummary ? (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/[0.04] px-4 py-3">
          <p className="text-sm font-medium text-destructive">Error summary</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{job.errorSummary}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Section title={`Targets (${job.targets.length})`}>
            {job.targets.length === 0 ? (
              <EmptyState title="No targets" description="This job did not target specific stores." />
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Succeeded</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Skipped</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.targets.map((target) => (
                      <TableRow key={target.id}>
                        <TableCell>
                          <Link href={`/stores/${target.connectionId}`} className="font-medium hover:underline">
                            {target.connection.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              target.status === 'COMPLETED'
                                ? 'success'
                                : target.status === 'FAILED'
                                  ? 'destructive'
                                  : 'muted'
                            }
                            size="sm"
                          >
                            {titleCase(target.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular text-right">{target.successCount}</TableCell>
                        <TableCell className="tabular text-right">{target.failureCount}</TableCell>
                        <TableCell className="tabular text-right">{target.skippedCount}</TableCell>
                        <TableCell className="max-w-sm">
                          <p className="text-xs leading-relaxed text-destructive">
                            {target.errorSummary ?? ''}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </Section>

          <Section title={`Item results (${formatNumber(job.items.length)})`}>
            {job.items.length === 0 ? (
              <EmptyState
                title="No item detail"
                description="This job did not record per-item results."
              />
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{item.resourceLabel ?? item.resourceKey}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.resourceType} · {item.resourceKey}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted" size="sm">
                            {titleCase(item.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === 'SUCCEEDED'
                                ? 'success'
                                : item.status === 'FAILED'
                                  ? 'destructive'
                                  : item.status === 'BLOCKED'
                                    ? 'warning'
                                    : 'muted'
                            }
                            size="sm"
                          >
                            {titleCase(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-xs leading-relaxed text-muted-foreground">{item.message ?? '—'}</p>
                        </TableCell>
                        <TableCell className="tabular text-right text-xs text-muted-foreground">
                          {item.durationMs ? `${item.durationMs}ms` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Job record</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Type" value={JOB_TYPE_LABELS[job.jobType as JobType] ?? job.jobType} />
                <StatRow label="Status" value={titleCase(job.status)} />
                <StatRow label="Dry run" value={job.isDryRun ? 'Yes' : 'No'} />
                <StatRow label="Resource category" value={job.resourceCategory ? titleCase(job.resourceCategory) : '—'} />
                <StatRow label="Total" value={formatNumber(job.totalCount)} />
                <StatRow label="Succeeded" value={formatNumber(job.successCount)} />
                <StatRow label="Failed" value={formatNumber(job.failureCount)} />
                <StatRow label="Skipped" value={formatNumber(job.skippedCount)} />
                <StatRow label="Retries" value={formatNumber(job.retryCount)} />
                <StatRow label="Started" value={job.startedAt ? formatDateTime(job.startedAt) : '—'} />
                <StatRow label="Finished" value={job.finishedAt ? formatDateTime(job.finishedAt) : '—'} />
                <StatRow
                  label="Duration"
                  value={durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : '—'}
                />
                <StatRow
                  label="Correlation id"
                  value={<code className="font-mono text-xs">{job.correlationId}</code>}
                  tooltip="This id appears in every server log line for this job, so a failure can be traced end to end."
                />
              </dl>
            </CardContent>
          </Card>

          {job.deployment ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Deployment</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/deployments/${job.deployment.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {job.deployment.name}
                </Link>
              </CardContent>
            </Card>
          ) : null}

          {Object.keys(parameters).length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Parameters</CardTitle>
                <CardDescription>Recorded so the job can be reproduced exactly.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs thin-scrollbar">
                  {JSON.stringify(parameters, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          {dryRunResult ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Dry-run result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs thin-scrollbar">
                  {JSON.stringify(dryRunResult, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <InfoNote className="mt-6">
        Jobs are idempotent on (job, resource key), so a re-run after a restart produces the same end state
        rather than duplicating work. Transient failures are retried with exponential backoff; permanent ones
        are recorded with the reason.
      </InfoNote>
    </>
  );
}
