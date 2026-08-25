import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { ConflictTypeBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { assertTenantAccess, scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import type { FieldDiff } from '@/lib/comparison/diff';
import { countryFlag, formatDateTime, formatRelativeTime, titleCase } from '@/lib/utils';
import { ResolveConflictDialog } from '../conflict-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Conflict' };

export default async function ConflictDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuthOrRedirect(`/conflicts/${id}`);
  const scope = scopeFromAuth(auth);

  const conflict = await prisma.conflict.findUnique({
    where: { id },
    include: {
      target: { select: { id: true, name: true, countryCode: true, currencyCode: true, healthStatus: true } },
      source: { select: { id: true, name: true, currencyCode: true } },
      resolutions: {
        orderBy: { createdAt: 'desc' },
        include: { resolvedBy: { select: { name: true } } },
      },
    },
  });

  if (!conflict) notFound();
  assertTenantAccess(conflict, scope, 'conflict');

  const diff = parseJsonLoose<FieldDiff[]>(conflict.diffJson, []);
  const sourceValue = parseJsonLoose<Record<string, unknown>>(conflict.sourceValueJson, {});
  const targetValue = parseJsonLoose<Record<string, unknown>>(conflict.targetValueJson, {});

  const label = conflict.resourceLabel ?? conflict.resourceKey;

  return (
    <>
      <PageHeader
        title={label}
        breadcrumbs={[
          { label: 'Operations' },
          { label: 'Conflicts', href: '/conflicts' },
          { label: titleCase(conflict.conflictType) },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="font-mono text-xs">{conflict.resourceKey}</code>·{' '}
            {titleCase(conflict.resourceCategory)} · detected {formatRelativeTime(conflict.detectedAt)}
          </span>
        }
        meta={
          <>
            <ConflictTypeBadge type={conflict.conflictType} />
            <Badge
              variant={
                conflict.severity === 'CRITICAL'
                  ? 'destructive'
                  : conflict.severity === 'HIGH'
                    ? 'warning'
                    : 'muted'
              }
            >
              {titleCase(conflict.severity)} severity
            </Badge>
            <Badge variant={conflict.status === 'OPEN' ? 'warning' : 'muted'}>
              {titleCase(conflict.status)}
            </Badge>
          </>
        }
        actions={
          <ResolveConflictDialog
            conflictId={conflict.id}
            resourceLabel={label}
            storeName={conflict.target.name}
            trigger={<button className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">Resolve</button>}
          />
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Source</CardDescription>
            <CardTitle className="text-base">
              {conflict.source ? (
                <Link href={`/stores/${conflict.source.id}`} className="hover:underline">
                  {conflict.source.name}
                </Link>
              ) : (
                'No source recorded'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1 text-sm">
              {Object.entries(sourceValue).length === 0 ? (
                <p className="text-muted-foreground">Not present in the source.</p>
              ) : (
                Object.entries(sourceValue).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 border-b py-1">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="max-w-[60%] truncate text-right font-medium">{renderValue(value)}</dd>
                  </div>
                ))
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center">
          <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Target</CardDescription>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <HealthDot status={conflict.target.healthStatus} />
              <span aria-hidden>{countryFlag(conflict.target.countryCode)}</span>
              <Link href={`/stores/${conflict.target.id}`} className="hover:underline">
                {conflict.target.name}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1 text-sm">
              {Object.entries(targetValue).length === 0 ? (
                <p className="text-muted-foreground">Not present in this store.</p>
              ) : (
                Object.entries(targetValue).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 border-b py-1">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="max-w-[60%] truncate text-right font-medium">{renderValue(value)}</dd>
                  </div>
                ))
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {diff.length > 0 ? (
        <Section title="Field-level differences">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Source value</TableHead>
                  <TableHead>Target value</TableHead>
                  <TableHead>Assessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diff.map((entry) => (
                  <TableRow key={entry.field}>
                    <TableCell className="font-medium">{entry.label}</TableCell>
                    <TableCell>
                      <code className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-xs">
                        {renderValue(entry.sourceValue)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs">
                        {renderValue(entry.targetValue)}
                      </code>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      {entry.isExpectedVariance ? (
                        <Badge variant="muted" size="sm">
                          Expected variance
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          Counted as drift
                        </Badge>
                      )}
                      {entry.note ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.note}</p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>
      ) : null}

      {conflict.source && conflict.source.currencyCode !== conflict.target.currencyCode ? (
        <InfoNote className="mb-6">
          These stores trade in different currencies ({conflict.source.currencyCode} and{' '}
          {conflict.target.currencyCode}). Price fields are therefore not compared — a different amount is
          expected, not drift.
        </InfoNote>
      ) : null}

      <Section title="Resolution history">
        {conflict.resolutions.length === 0 ? (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                No decision has been recorded yet. Every resolution, including &ldquo;leave it as it is&rdquo;,
                is written to the audit log.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflict.resolutions.map((resolution) => (
                  <TableRow key={resolution.id}>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {titleCase(resolution.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          resolution.outcome === 'APPLIED'
                            ? 'success'
                            : resolution.outcome === 'QUEUED'
                              ? 'info'
                              : 'muted'
                        }
                        size="sm"
                      >
                        {titleCase(resolution.outcome)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {resolution.note ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{resolution.resolvedBy?.name ?? 'System'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(resolution.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>
    </>
  );
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
