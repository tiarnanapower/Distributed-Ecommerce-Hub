import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import {
  INHERITANCE_MODE_DESCRIPTIONS,
  INHERITANCE_MODE_LABELS,
  INHERITANCE_MODES,
  type InheritanceMode,
} from '@/lib/enums';
import { RESOURCE_CATEGORY_META, type ResourceCategory } from '@/lib/resource-categories';
import { titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Inheritance policies' };
export const dynamic = 'force-dynamic';

export default async function InheritanceSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/inheritance');
  const scope = scopeFromAuth(auth);

  const [policies, companies, stores] = await Promise.all([
    prisma.inheritancePolicy.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: [{ scopeType: 'asc' }, { resourceCategory: 'asc' }],
    }),
    prisma.company.findMany({
      where: { organisationId: scope.organisationId },
      select: { id: true, name: true },
    }),
    prisma.storeConnection.findMany({
      where: { organisationId: scope.organisationId },
      select: { id: true, name: true },
    }),
  ]);

  const nameFor = (scopeType: string, scopeId: string) => {
    if (scopeType === 'ORGANISATION') return 'Organisation default';
    if (scopeType === 'COMPANY') return companies.find((c) => c.id === scopeId)?.name ?? 'Unknown company';
    if (scopeType === 'STORE') return stores.find((s) => s.id === scopeId)?.name ?? 'Unknown store';
    return scopeId;
  };

  const organisationPolicies = policies.filter((policy) => policy.scopeType === 'ORGANISATION');
  const overrides = policies.filter((policy) => policy.scopeType !== 'ORGANISATION');

  return (
    <div className="space-y-4">
      <InfoNote>
        Modes are resolved most-specific-first: store, then store group, region, company, and finally the
        organisation default. Whichever wins is shown on each store&rsquo;s Configuration tab along with the
        reason.
      </InfoNote>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">What each mode means</CardTitle>
          <CardDescription>These six modes are the whole vocabulary of inheritance here.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            {INHERITANCE_MODES.map((mode) => (
              <div key={mode} className="flex gap-3 border-b pb-2 last:border-0">
                <dt className="w-52 shrink-0">
                  <Badge variant="secondary" size="sm">
                    {INHERITANCE_MODE_LABELS[mode as InheritanceMode]}
                  </Badge>
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">
                  {INHERITANCE_MODE_DESCRIPTIONS[mode as InheritanceMode]}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Section title="Organisation defaults" description="Applied wherever nothing more specific overrides them.">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource category</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Automation</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organisationPolicies.map((policy) => {
                const meta = RESOURCE_CATEGORY_META[policy.resourceCategory as ResourceCategory];
                return (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">{meta?.label ?? policy.resourceCategory}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {INHERITANCE_MODE_LABELS[policy.mode as InheritanceMode] ?? policy.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {titleCase(policy.sourceType)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          meta?.automation === 'AUTOMATED'
                            ? 'success'
                            : meta?.automation === 'PARTIAL'
                              ? 'warning'
                              : 'muted'
                        }
                        size="sm"
                      >
                        {titleCase(meta?.automation ?? 'UNKNOWN')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {policy.notes ?? meta?.note}
                      </p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Scoped overrides" description="Policies that take precedence over the organisation default.">
        {overrides.length === 0 ? (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                Every store follows the organisation defaults. Adding a company-, region- or store-level policy
                narrows that.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <Badge variant="outline" size="sm">
                        {titleCase(policy.scopeType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {nameFor(policy.scopeType, policy.scopeId)}
                    </TableCell>
                    <TableCell>
                      {RESOURCE_CATEGORY_META[policy.resourceCategory as ResourceCategory]?.label ??
                        policy.resourceCategory}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {INHERITANCE_MODE_LABELS[policy.mode as InheritanceMode] ?? policy.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-xs leading-relaxed text-muted-foreground">{policy.notes ?? '—'}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>
    </div>
  );
}
