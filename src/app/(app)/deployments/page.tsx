import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { DeploymentStatusBadge, RiskBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import { formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Deployments' };
export const dynamic = 'force-dynamic';

export default async function DeploymentsPage() {
  const auth = await requireAuthOrRedirect('/deployments');
  const scope = scopeFromAuth(auth);

  const [deployments, approvals, byStatus] = await Promise.all([
    prisma.deployment.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        source: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { targets: true, items: true } },
      },
    }),
    prisma.approvalRequest.findMany({
      where: { organisationId: scope.organisationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: { name: true } } },
    }),
    prisma.deployment.groupBy({
      by: ['status'],
      where: { organisationId: scope.organisationId },
      _count: { _all: true },
    }),
  ]);

  const count = (status: string) => byStatus.find((entry) => entry.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Deployments"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Deployments' }]}
        description="Every cross-store change, from draft through dry-run to execution, with the blast radius recorded at each stage."
        actions={
          <Button size="sm" asChild>
            <Link href="/deployments/new">
              <Plus className="h-4 w-4" aria-hidden />
              New deployment
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total" value={formatNumber(deployments.length)} />
        <MetricCard label="Drafts" value={formatNumber(count('DRAFT'))} />
        <MetricCard
          label="Awaiting approval"
          value={formatNumber(count('AWAITING_APPROVAL'))}
          tone={count('AWAITING_APPROVAL') > 0 ? 'warning' : 'default'}
        />
        <MetricCard label="Completed" value={formatNumber(count('COMPLETED'))} tone="success" />
        <MetricCard
          label="Partial or failed"
          value={formatNumber(count('PARTIAL') + count('FAILED'))}
          tone={count('PARTIAL') + count('FAILED') > 0 ? 'warning' : 'default'}
        />
      </div>

      {approvals.length > 0 ? (
        <Section title={`Awaiting your decision (${approvals.length})`}>
          <div className="grid gap-3 md:grid-cols-2">
            {approvals.map((approval) => (
              <Card key={approval.id} className="border-warning/40">
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{approval.title}</p>
                    <RiskBadge level={approval.riskLevel} />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{approval.reason}</p>
                  {approval.changeSummary ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Change:</span> {approval.changeSummary}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Requested by {approval.requester.name} · {formatRelativeTime(approval.createdAt)}
                    </span>
                    {approval.subjectType === 'DEPLOYMENT' ? (
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <Link href={`/deployments/${approval.subjectId}`}>Review</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <InfoNote className="mb-6">
        A deployment never writes on creation. It produces a plan: per-target capability verdicts, validation
        errors, the change list and a blast-radius summary. Destructive plans require a typed confirmation
        before they can be executed.
      </InfoNote>

      {deployments.length === 0 ? (
        <EmptyState
          title="No deployments yet"
          description="Create one to model a cross-store change and see exactly what it would do."
          action={{ label: 'New deployment', href: '/deployments/new' }}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deployment</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Targets</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => {
                const blast = parseJsonLoose<{ recordCount?: number; destructiveCount?: number }>(
                  deployment.blastRadiusJson ?? '{}',
                  {},
                );
                return (
                  <TableRow key={deployment.id}>
                    <TableCell className="max-w-sm">
                      <Link href={`/deployments/${deployment.id}`} className="font-medium hover:underline">
                        {deployment.name}
                      </Link>
                      {deployment.description ? (
                        <p className="truncate text-xs text-muted-foreground">{deployment.description}</p>
                      ) : null}
                      {(blast.destructiveCount ?? 0) > 0 ? (
                        <Badge variant="destructive" size="sm" className="mt-1">
                          {blast.destructiveCount} destructive change(s)
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {titleCase(deployment.resourceCategory)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {deployment.source?.name ?? '—'}
                    </TableCell>
                    <TableCell className="tabular text-right">{deployment._count.targets}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(blast.recordCount ?? deployment._count.items)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {titleCase(deployment.strategy)}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={deployment.riskLevel} />
                    </TableCell>
                    <TableCell>
                      <DeploymentStatusBadge status={deployment.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(deployment.createdAt)}
                      {deployment.createdBy ? <p>{deployment.createdBy.name}</p> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
