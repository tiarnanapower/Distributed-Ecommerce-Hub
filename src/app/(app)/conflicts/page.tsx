import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { ConflictTypeBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { countryFlag, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';
import { ResolveConflictDialog, RunComparisonDialog } from './conflict-actions';

export const metadata: Metadata = { title: 'Conflicts' };
export const dynamic = 'force-dynamic';

const OPEN_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'MANUAL_REVIEW'];

export default async function ConflictsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; stores?: string; category?: string; status?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/conflicts');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, hierarchyMode: true },
  });

  const storeFilter = params.store
    ? [params.store]
    : params.stores
      ? params.stores.split(',')
      : stores.map((store) => store.id);

  const statusFilter = params.status
    ? params.status.split(',')
    : OPEN_STATUSES;

  const [conflicts, byStatus, byCategory, byType] = await Promise.all([
    prisma.conflict.findMany({
      where: {
        organisationId: scope.organisationId,
        targetConnectionId: { in: storeFilter },
        ...(params.category ? { resourceCategory: params.category } : {}),
        status: { in: statusFilter },
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: 300,
      include: {
        target: { select: { id: true, name: true, countryCode: true, healthStatus: true } },
        source: { select: { id: true, name: true } },
        resolutions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.conflict.groupBy({
      by: ['status'],
      where: { organisationId: scope.organisationId, targetConnectionId: { in: storeFilter } },
      _count: { _all: true },
    }),
    prisma.conflict.groupBy({
      by: ['resourceCategory'],
      where: {
        organisationId: scope.organisationId,
        targetConnectionId: { in: storeFilter },
        status: { in: OPEN_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.conflict.groupBy({
      by: ['conflictType'],
      where: {
        organisationId: scope.organisationId,
        targetConnectionId: { in: storeFilter },
        status: { in: OPEN_STATUSES },
      },
      _count: { _all: true },
    }),
  ]);

  const count = (status: string) => byStatus.find((entry) => entry.status === status)?._count._all ?? 0;
  const open = OPEN_STATUSES.reduce((sum, status) => sum + count(status), 0);

  return (
    <>
      <PageHeader
        title="Conflicts"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Conflicts' }]}
        description="Where a store differs from its source. Some differences are deliberate; the point of this queue is to tell those apart from drift."
        actions={
          <RunComparisonDialog
            stores={stores.map((store) => ({
              id: store.id,
              name: store.name,
              isMaster: store.hierarchyMode === 'MASTER' || store.hierarchyMode === 'MSF_PARENT',
            }))}
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Open" value={formatNumber(open)} tone={open > 0 ? 'warning' : 'default'} />
        <MetricCard label="Resolved" value={formatNumber(count('RESOLVED'))} tone="success" />
        <MetricCard
          label="Accepted variance"
          value={formatNumber(count('ACCEPTED_VARIANCE'))}
          tooltip="Differences an operator has deliberately signed off. They stay visible but no longer count as drift."
        />
        <MetricCard label="Excluded" value={formatNumber(count('EXCLUDED'))} />
        <MetricCard label="Manual review" value={formatNumber(count('MANUAL_REVIEW'))} />
      </div>

      {byType.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {byType
            .sort((a, b) => b._count._all - a._count._all)
            .map((entry) => (
              <Badge key={entry.conflictType} variant="outline" className="gap-1.5">
                <ConflictTypeBadge type={entry.conflictType} />
                {formatNumber(entry._count._all)}
              </Badge>
            ))}
        </div>
      ) : null}

      <InfoNote className="mb-6">
        A difference explained by a recorded local override is shown as{' '}
        <span className="font-medium">Local override</span>, not drift. A difference with no override behind it
        is <span className="font-medium">Value mismatch</span> — that is the one worth investigating. Price
        differences across currencies are never counted at all.
      </InfoNote>

      {conflicts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing outstanding"
          description="Every store in scope matches its source on the categories that have been compared. Run a fresh comparison to check again."
        />
      ) : (
        <Section
          title={`${formatNumber(conflicts.length)} difference${conflicts.length === 1 ? '' : 's'}`}
          description={
            byCategory.length > 0
              ? `By category: ${byCategory.map((entry) => `${titleCase(entry.resourceCategory)} ${entry._count._all}`).join(' · ')}`
              : undefined
          }
        >
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Compared with</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts.map((conflict) => (
                  <TableRow key={conflict.id}>
                    <TableCell className="max-w-xs">
                      <Link href={`/conflicts/${conflict.id}`} className="font-medium hover:underline">
                        {conflict.resourceLabel ?? conflict.resourceKey}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{conflict.resourceKey}</p>
                      <Badge variant="secondary" size="sm" className="mt-1">
                        {titleCase(conflict.resourceCategory)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/stores/${conflict.targetConnectionId}`}
                        className="flex items-center gap-1.5 text-sm hover:underline"
                      >
                        <HealthDot status={conflict.target.healthStatus} />
                        <span aria-hidden>{countryFlag(conflict.target.countryCode)}</span>
                        {conflict.target.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {conflict.source?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <ConflictTypeBadge type={conflict.conflictType} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          conflict.severity === 'CRITICAL'
                            ? 'destructive'
                            : conflict.severity === 'HIGH'
                              ? 'warning'
                              : conflict.severity === 'MEDIUM'
                                ? 'info'
                                : 'muted'
                        }
                        size="sm"
                      >
                        {titleCase(conflict.severity)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          conflict.status === 'OPEN'
                            ? 'warning'
                            : conflict.status === 'MANUAL_REVIEW'
                              ? 'info'
                              : 'muted'
                        }
                        size="sm"
                      >
                        {titleCase(conflict.status)}
                      </Badge>
                      {conflict.resolutions[0] ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {titleCase(conflict.resolutions[0].action)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(conflict.detectedAt)}
                    </TableCell>
                    <TableCell>
                      <ResolveConflictDialog
                        conflictId={conflict.id}
                        resourceLabel={conflict.resourceLabel ?? conflict.resourceKey}
                        storeName={conflict.target.name}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>
      )}
    </>
  );
}
