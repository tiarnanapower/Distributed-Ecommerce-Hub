import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AlertTriangle, Building2, Coins, Globe, Layers, Package, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { DeploymentStatusBadge, HealthDot, RiskBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { assertTenantAccess, scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import type { BlastRadius } from '@/lib/deployment/planner';
import { countryFlag, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';
import { ApprovalPanel, ExecutePanel } from './execute-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const deployment = await prisma.deployment.findUnique({ where: { id }, select: { name: true } });
  return { title: deployment?.name ?? 'Deployment' };
}

export default async function DeploymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthOrRedirect(`/deployments/${id}`);
  const scope = scopeFromAuth(auth);

  const deployment = await prisma.deployment.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, currencyCode: true } },
      createdBy: { select: { name: true } },
      targets: {
        include: {
          connection: {
            select: { id: true, name: true, countryCode: true, currencyCode: true, healthStatus: true, isDemo: true },
          },
          items: { orderBy: { changeType: 'asc' }, take: 50 },
        },
      },
      jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!deployment) notFound();
  assertTenantAccess(deployment, scope, 'deployment');

  const approval = deployment.approvalRequestId
    ? await prisma.approvalRequest.findUnique({
        where: { id: deployment.approvalRequestId },
        include: { requester: { select: { name: true } }, approver: { select: { name: true } } },
      })
    : null;

  const blast = parseJsonLoose<Partial<BlastRadius>>(deployment.blastRadiusJson ?? '{}', {});
  const summary = parseJsonLoose<{
    errors?: string[];
    warnings?: string[];
    requiresTypedConfirmation?: boolean;
    confirmationPhrase?: string | null;
    calculatedAt?: string;
  }>(deployment.dryRunSummaryJson ?? '{}', {});

  const rollback = deployment.rollbackInfoJson
    ? parseJsonLoose<{ strategy?: string; capturedAt?: string; note?: string }>(deployment.rollbackInfoJson, {})
    : null;

  const liveTargets = deployment.targets.filter((target) => !target.connection.isDemo).length;
  const simulatedTargets = deployment.targets.length - liveTargets;
  const totalItems = deployment.targets.reduce((sum, target) => sum + target.items.length, 0);

  return (
    <>
      <PageHeader
        title={deployment.name}
        breadcrumbs={[
          { label: 'Operations' },
          { label: 'Deployments', href: '/deployments' },
          { label: deployment.name },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            {titleCase(deployment.resourceCategory)} · {titleCase(deployment.strategy)}
            {deployment.source ? (
              <>
                · from{' '}
                <Link href={`/stores/${deployment.source.id}`} className="hover:underline">
                  {deployment.source.name}
                </Link>
              </>
            ) : null}
            {deployment.createdBy ? <>· created by {deployment.createdBy.name}</> : null}
          </span>
        }
        meta={
          <>
            <DeploymentStatusBadge status={deployment.status} />
            <RiskBadge level={deployment.riskLevel} />
            {deployment.preserveLocalOverrides ? (
              <Badge variant="muted">Preserving local overrides</Badge>
            ) : (
              <Badge variant="destructive">Overwrites local overrides</Badge>
            )}
          </>
        }
      />

      {deployment.description ? (
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {deployment.description}
        </p>
      ) : null}

      {/* Blast radius */}
      <Section
        title="Blast radius"
        description={
          summary.calculatedAt
            ? `Calculated ${formatRelativeTime(new Date(summary.calculatedAt))}.`
            : 'The scope of what this deployment would change.'
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <BlastTile icon={Building2} label="Stores" value={formatNumber(blast.storeCount ?? 0)} />
          <BlastTile icon={Layers} label="Channels" value={formatNumber(blast.channelCount ?? 0)} />
          <BlastTile icon={Package} label="Records" value={formatNumber(blast.recordCount ?? 0)} />
          <BlastTile
            icon={AlertTriangle}
            label="Destructive"
            value={formatNumber(blast.destructiveCount ?? 0)}
            tone={(blast.destructiveCount ?? 0) > 0 ? 'destructive' : 'default'}
          />
          <BlastTile
            icon={Wrench}
            label="Unsupported"
            value={formatNumber(blast.unsupportedCount ?? 0)}
            tone={(blast.unsupportedCount ?? 0) > 0 ? 'warning' : 'default'}
          />
          <BlastTile
            icon={Coins}
            label="Currencies"
            value={(blast.currenciesAffected ?? []).join(', ') || '—'}
          />
          <BlastTile
            icon={Globe}
            label="Countries"
            value={(blast.countriesAffected ?? []).join(', ') || '—'}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Stores with local overrides
              </p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatNumber(blast.storesWithLocalOverrides ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Stores needing manual action
              </p>
              <p className="tabular mt-1 text-xl font-semibold">
                {formatNumber(blast.storesRequiringManualAction ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Stores excluded</p>
              <p className="tabular mt-1 text-xl font-semibold">{formatNumber(blast.storesExcluded ?? 0)}</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {(summary.errors ?? []).length > 0 ? (
        <WarningNote className="mb-4">
          <span className="font-medium">Blocking problems ({summary.errors!.length}).</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {summary.errors!.slice(0, 8).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </WarningNote>
      ) : null}

      {(summary.warnings ?? []).length > 0 ? (
        <InfoNote className="mb-6">
          <span className="font-medium">Read before confirming ({summary.warnings!.length}).</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {summary.warnings!.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </InfoNote>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Section title={`Targets (${deployment.targets.length})`}>
            <div className="space-y-3">
              {deployment.targets.map((target) => (
                <Card key={target.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-1.5 text-sm">
                          <HealthDot status={target.connection.healthStatus} />
                          <span aria-hidden>{countryFlag(target.connection.countryCode)}</span>
                          <Link href={`/stores/${target.connectionId}`} className="hover:underline">
                            {target.connection.name}
                          </Link>
                          <Badge variant="muted" size="sm">
                            {target.connection.currencyCode}
                          </Badge>
                          {target.connection.isDemo ? (
                            <Badge variant="info" size="sm">
                              Demo
                            </Badge>
                          ) : null}
                        </CardTitle>
                        {target.unsupportedReason ? (
                          <CardDescription className="mt-1">{target.unsupportedReason}</CardDescription>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant={
                            target.status === 'COMPLETED'
                              ? 'success'
                              : target.status === 'BLOCKED'
                                ? 'destructive'
                                : target.status === 'SKIPPED'
                                  ? 'muted'
                                  : 'info'
                          }
                          size="sm"
                        >
                          {titleCase(target.status)}
                        </Badge>
                        {target.hasLocalOverrides ? (
                          <Badge variant="warning" size="sm">
                            Has overrides
                          </Badge>
                        ) : null}
                        {target.requiresManualAction ? (
                          <Badge variant="warning" size="sm">
                            Manual action
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>

                  {target.items.length > 0 ? (
                    <CardContent className="px-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Resource</TableHead>
                            <TableHead>Change</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {target.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <p className="text-sm font-medium">{item.resourceLabel ?? item.resourceKey}</p>
                                <p className="font-mono text-xs text-muted-foreground">{item.resourceKey}</p>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    item.changeType === 'CREATE'
                                      ? 'success'
                                      : item.changeType === 'UPDATE'
                                        ? 'info'
                                        : item.changeType === 'DELETE'
                                          ? 'destructive'
                                          : item.changeType === 'MANUAL'
                                            ? 'warning'
                                            : 'muted'
                                  }
                                  size="sm"
                                >
                                  {titleCase(item.changeType)}
                                </Badge>
                                {item.isDestructive ? (
                                  <Badge variant="destructive" size="sm" className="ml-1">
                                    Destructive
                                  </Badge>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    item.status === 'SUCCEEDED'
                                      ? 'success'
                                      : item.status === 'BLOCKED' || item.status === 'FAILED'
                                        ? 'destructive'
                                        : 'muted'
                                  }
                                  size="sm"
                                >
                                  {titleCase(item.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-sm">
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  {item.message ?? '—'}
                                </p>
                                {item.validationJson ? (
                                  <p className="mt-0.5 text-xs leading-relaxed text-destructive">
                                    {parseJsonLoose<string[]>(item.validationJson, []).join(' ')}
                                  </p>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  ) : (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        No changes planned for this target.
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          {approval && approval.status === 'PENDING' ? (
            <ApprovalPanel
              approvalId={approval.id}
              title={approval.title}
              reason={approval.reason}
              changeSummary={approval.changeSummary}
              targetScope={approval.targetScope}
              riskLevel={approval.riskLevel}
              requesterName={approval.requester.name}
            />
          ) : null}

          <ExecutePanel
            deploymentId={deployment.id}
            status={deployment.status}
            requiresTypedConfirmation={summary.requiresTypedConfirmation ?? false}
            confirmationPhrase={summary.confirmationPhrase ?? null}
            errors={summary.errors ?? []}
            liveTargetCount={liveTargets}
            simulatedTargetCount={simulatedTargets}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Deployment record</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <StatRow label="Status" value={titleCase(deployment.status)} />
                <StatRow label="Strategy" value={titleCase(deployment.strategy)} />
                <StatRow label="Risk level" value={titleCase(deployment.riskLevel)} />
                <StatRow label="Planned items" value={formatNumber(totalItems)} />
                <StatRow label="Dry-run at" value={formatRelativeTime(deployment.dryRunAt)} />
                <StatRow label="Started" value={formatRelativeTime(deployment.startedAt)} />
                <StatRow label="Finished" value={formatRelativeTime(deployment.finishedAt)} />
              </dl>
            </CardContent>
          </Card>

          {rollback ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Rollback information</CardTitle>
                <CardDescription>Captured before execution so the change can be reversed.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  <StatRow label="Strategy" value={rollback.strategy ?? '—'} />
                  <StatRow
                    label="Captured"
                    value={rollback.capturedAt ? formatRelativeTime(new Date(rollback.capturedAt)) : '—'}
                  />
                </dl>
                {rollback.note ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{rollback.note}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {deployment.jobs.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Execution jobs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deployment.jobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/sync/${job.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/40"
                  >
                    <span className="truncate">{titleCase(job.jobType)}</span>
                    <Badge variant="muted" size="sm">
                      {titleCase(job.status)}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function BlastTile({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'destructive';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </p>
        <p
          className={
            tone === 'destructive'
              ? 'tabular mt-1 truncate text-xl font-semibold text-destructive'
              : tone === 'warning'
                ? 'tabular mt-1 truncate text-xl font-semibold text-warning'
                : 'tabular mt-1 truncate text-xl font-semibold'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
