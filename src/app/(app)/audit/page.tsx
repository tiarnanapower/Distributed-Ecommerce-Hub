import type { Metadata } from 'next';

import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/utils';
import { AuditTable, type AuditRow } from './audit-table';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const auth = await requireAuthOrRedirect('/audit');
  const scope = scopeFromAuth(auth);

  const [events, byOutcome, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { connection: { select: { id: true, name: true } }, actor: { select: { name: true } } },
    }),
    prisma.auditEvent.groupBy({
      by: ['outcome'],
      where: { organisationId: scope.organisationId },
      _count: { _all: true },
    }),
    prisma.auditEvent.count({ where: { organisationId: scope.organisationId } }),
  ]);

  const rows: AuditRow[] = events.map((event) => ({
    id: event.id,
    action: event.action,
    resourceType: event.resourceType,
    resourceLabel: event.resourceLabel,
    resourceId: event.resourceId,
    outcome: event.outcome,
    actorLabel: event.actorLabel ?? event.actor?.name ?? 'System',
    actorType: event.actorType,
    storeName: event.connection?.name ?? null,
    storeId: event.connection?.id ?? null,
    beforeSummary: event.beforeSummary,
    afterSummary: event.afterSummary,
    errorSummary: event.errorSummary,
    correlationId: event.correlationId,
    createdAt: event.createdAt,
  }));

  const count = (outcome: string) => byOutcome.find((entry) => entry.outcome === outcome)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Audit log"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Audit Log' }]}
        description="Every meaningful action, who took it, what changed and how it turned out."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Recorded events" value={formatNumber(total)} />
        <MetricCard label="Succeeded" value={formatNumber(count('SUCCESS'))} tone="success" />
        <MetricCard
          label="Failed"
          value={formatNumber(count('FAILURE'))}
          tone={count('FAILURE') > 0 ? 'destructive' : 'default'}
        />
        <MetricCard label="Partial" value={formatNumber(count('PARTIAL'))} />
        <MetricCard
          label="Dry runs"
          value={formatNumber(count('DRY_RUN'))}
          tooltip="Dry-runs are audited too, so you can see what was considered as well as what was applied."
        />
      </div>

      <InfoNote className="mb-6">
        <span className="font-medium">No secret ever reaches an audit row.</span> Every payload passes through a
        redaction step before it is written, and a credential change records only that it happened — never the
        value. Client IP addresses are stored as a keyed hash, not in the clear.
      </InfoNote>

      <AuditTable events={rows} />

      {total > rows.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the {formatNumber(rows.length)} most recent of {formatNumber(total)} events. Export to CSV for
          the filtered set, or configure retention under Settings → Data retention.
        </p>
      ) : null}
    </>
  );
}
