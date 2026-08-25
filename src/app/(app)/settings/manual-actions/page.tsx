import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MetricCard } from '@/components/shared/metric-card';
import { Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import { ManualActionStatus } from './action-status';

export const metadata: Metadata = { title: 'Manual actions' };
export const dynamic = 'force-dynamic';

export default async function ManualActionsPage() {
  const auth = await requireAuthOrRedirect('/settings/manual-actions');
  const scope = scopeFromAuth(auth);

  const items = await prisma.manualActionItem.findMany({
    where: { organisationId: scope.organisationId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { connection: { select: { id: true, name: true } } },
  });

  const pending = items.filter((item) => item.status === 'PENDING').length;
  const inProgress = items.filter((item) => item.status === 'IN_PROGRESS').length;
  const completed = items.filter((item) => item.status === 'COMPLETED').length;

  return (
    <div className="space-y-4">
      <InfoNote>
        <span className="font-medium">Not everything has an API.</span> Where a change cannot be automated, the
        platform records the current value, the desired value and the reason, then tracks it as a checklist item
        so it does not quietly get lost. Completing one is written to the audit log.
      </InfoNote>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Pending" value={formatNumber(pending)} tone={pending > 0 ? 'warning' : 'default'} />
        <MetricCard label="In progress" value={formatNumber(inProgress)} />
        <MetricCard label="Completed" value={formatNumber(completed)} tone="success" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing outstanding"
          description="No manual actions have been raised for this organisation."
        />
      ) : (
        <Section title="Checklist">
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className={item.status === 'COMPLETED' ? 'opacity-70' : undefined}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={
                            item.status === 'COMPLETED'
                              ? 'font-medium text-muted-foreground line-through'
                              : 'font-medium'
                          }
                        >
                          {item.title}
                        </p>
                        <Badge variant="outline" size="sm">
                          {item.category}
                        </Badge>
                        {item.connection ? (
                          <Link
                            href={`/stores/${item.connection.id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            {item.connection.name}
                          </Link>
                        ) : null}
                      </div>

                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>

                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">Why it cannot be automated:</span>{' '}
                        {item.reason}
                      </p>

                      <dl className="mt-2 grid gap-x-8 text-xs sm:grid-cols-2">
                        <div className="flex gap-2 border-b py-1">
                          <dt className="text-muted-foreground">Current value</dt>
                          <dd className="ml-auto font-medium">{item.currentValue ?? 'Unknown'}</dd>
                        </div>
                        <div className="flex gap-2 border-b py-1">
                          <dt className="text-muted-foreground">Desired value</dt>
                          <dd className="ml-auto font-medium">{item.desiredValue ?? '—'}</dd>
                        </div>
                      </dl>

                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {item.docsUrl ? (
                          <a
                            href={item.docsUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            BigCommerce documentation
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">No documentation link recorded.</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Raised {formatRelativeTime(item.createdAt)}
                          {item.completedAt ? ` · completed ${formatRelativeTime(item.completedAt)}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <ManualActionStatus id={item.id} status={item.status} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
