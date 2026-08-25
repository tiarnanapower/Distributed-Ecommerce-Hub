import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, Check, Copy, Minus, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote, WarningNote } from '@/components/shared/states';
import { CapabilityBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { mapCustomerGroups } from '@/lib/comparison/mapping';
import { countryFlag, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Customer groups' };
export const dynamic = 'force-dynamic';

export default async function CustomerGroupsPage() {
  const auth = await requireAuthOrRedirect('/customer-groups');
  const scope = scopeFromAuth(auth);

  const [templates, stores, mappings] = await Promise.all([
    prisma.customerGroupTemplate.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { name: 'asc' },
      include: { company: { select: { name: true } }, _count: { select: { mappings: true } } },
    }),
    prisma.storeConnection.findMany({
      where: { ...tenantWhere(scope), deletedAt: null },
      orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        countryCode: true,
        healthStatus: true,
        hierarchyMode: true,
        classification: true,
      },
    }),
    prisma.customerGroupMapping.findMany({
      where: { organisationId: scope.organisationId },
      include: { connection: { select: { id: true, name: true } } },
    }),
  ]);

  const templateNames = templates.map((template) => template.name);

  // For every store, work out how its groups line up with the template set.
  const perStore = stores.map((store) => {
    const storeGroups = mappings.filter((mapping) => mapping.connectionId === store.id);
    const matches = mapCustomerGroups(
      templateNames,
      storeGroups.map((group) => ({
        externalId: group.externalGroupId,
        name: group.externalGroupName,
        discountSummary: group.discountSummary,
      })),
    );
    const unmanaged = storeGroups.filter(
      (group) => !templateNames.some((name) => name.toLowerCase() === group.externalGroupName.toLowerCase()),
    );
    return { store, matches, storeGroups, unmanaged };
  });

  const conflicts = perStore.flatMap((entry) =>
    entry.matches.filter((match) => match.status === 'NAME_CONFLICT').map((match) => ({ store: entry.store, match })),
  );
  const missing = perStore.reduce(
    (total, entry) => total + entry.matches.filter((match) => match.status === 'MISSING_IN_TARGET').length,
    0,
  );

  return (
    <>
      <PageHeader
        title="Customer groups"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Customer Groups' }]}
        description="Define the group structure once as a template, then compare and copy it across stores. Numeric group ids are never assumed to match."
        actions={
          <Button size="sm" asChild>
            <Link href="/deployments/new?category=CUSTOMER_GROUPS">
              <Copy className="h-4 w-4" aria-hidden />
              Plan a group deployment
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Templates" value={formatNumber(templates.length)} />
        <MetricCard label="Stores compared" value={formatNumber(stores.length)} />
        <MetricCard
          label="Missing in a store"
          value={formatNumber(missing)}
          tone={missing > 0 ? 'warning' : 'default'}
          tooltip="A template group that does not exist in that store. Creating it there produces a new store-local numeric id."
        />
        <MetricCard
          label="Name conflicts"
          value={formatNumber(conflicts.length)}
          tone={conflicts.length > 0 ? 'destructive' : 'default'}
          tooltip="A store has a group whose name differs only in case or spacing. Deploying without resolving this would create a duplicate."
        />
      </div>

      {conflicts.length > 0 ? (
        <WarningNote className="mb-6">
          <span className="font-medium">
            {conflicts.length} naming conflict{conflicts.length === 1 ? '' : 's'} must be resolved before a
            deployment.
          </span>{' '}
          {conflicts
            .slice(0, 3)
            .map((entry) => `${entry.store.name}: “${entry.match.targetGroupName}” vs “${entry.match.templateName}”`)
            .join('; ')}
          . Deploying now would create duplicate groups rather than updating the existing ones.
        </WarningNote>
      ) : null}

      <InfoNote className="mb-6">
        <span className="font-medium">Group ids are store-local.</span> &ldquo;Trade Gold&rdquo; might be id 13
        in one store and 27 in another. Every cross-store operation resolves the group through the mapping table
        below, matched on name, never on id.
      </InfoNote>

      <Section title="Templates" description="The intended group structure, defined once at organisation or company level.">
        {templates.length === 0 ? (
          <EmptyState
            title="No templates"
            description="Define a customer-group template to start comparing structure across stores."
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Mapped stores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <p className="font-medium">{template.name}</p>
                      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        {template.description}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {template.company?.name ?? 'Organisation-wide'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {template.discountType === 'PERCENT'
                          ? `${template.discountValue}%`
                          : template.discountType === 'PRICE_LIST'
                            ? 'Price list'
                            : template.discountType === 'FIXED'
                              ? template.discountValue
                              : 'None'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.isDefaultGroup ? (
                        <Check className="h-4 w-4 text-success" aria-label="Default group" />
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground/40" aria-label="Not the default group" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.status === 'PUBLISHED' ? 'success' : 'muted'} size="sm">
                        {titleCase(template.status)} · v{template.version}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-right">{template._count.mappings}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      <Section
        title="Structure across stores"
        description="Templates on columns, stores on rows. Each cell shows the store-local group id where one exists."
      >
        <Card>
          <div className="overflow-x-auto thin-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[14rem] bg-background">Store</TableHead>
                  {templateNames.map((name) => (
                    <TableHead key={name} className="min-w-[8rem]">
                      {name}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[10rem]">Unmanaged groups</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perStore.map(({ store, matches, unmanaged }) => (
                  <TableRow key={store.id}>
                    <TableCell className="sticky left-0 z-10 bg-background">
                      <Link
                        href={`/stores/${store.id}`}
                        className="flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <HealthDot status={store.healthStatus} />
                        <span aria-hidden>{countryFlag(store.countryCode)}</span>
                        {store.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{titleCase(store.classification)}</p>
                    </TableCell>

                    {matches.map((match) => (
                      <TableCell key={match.templateName}>
                        {match.status === 'MAPPED' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-sm text-success">
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Present
                            </span>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                              id {match.targetGroupId ?? '—'}
                            </p>
                          </div>
                        ) : match.status === 'NAME_CONFLICT' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-sm text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                Conflict
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{match.note}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-sm text-warning">
                                <X className="h-3.5 w-3.5" aria-hidden />
                                Missing
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{match.note}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    ))}

                    <TableCell>
                      {unmanaged.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {unmanaged.map((group) => (
                            <Badge key={group.id} variant="muted" size="sm">
                              {group.externalGroupName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </Section>

      <Section title="Mappings" description="The recorded link between a template and a store's numeric group id.">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Group name in store</TableHead>
                <TableHead>Store-local id</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last deployed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell>
                    <Link href={`/stores/${mapping.connectionId}`} className="text-sm hover:underline">
                      {mapping.connection.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{mapping.externalGroupName}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">
                      {mapping.externalGroupId ?? '—'}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {mapping.discountSummary ?? '—'}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {mapping.memberCount === null ? '—' : formatNumber(mapping.memberCount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        mapping.status === 'MAPPED' || mapping.status === 'DEPLOYED'
                          ? 'success'
                          : mapping.status === 'NAME_CONFLICT'
                            ? 'destructive'
                            : mapping.status === 'MISSING_IN_TARGET'
                              ? 'warning'
                              : 'muted'
                      }
                      size="sm"
                    >
                      {titleCase(mapping.status)}
                    </Badge>
                    {mapping.notes ? (
                      <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
                        {mapping.notes}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(mapping.lastDeployedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Copying a group structure</CardTitle>
          <CardDescription>What actually happens when you deploy a template to a store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Present.</span> The group already exists under that
            name. Its discount and category access are compared; differences are reported as conflicts.
          </p>
          <p>
            <span className="font-medium text-foreground">Missing.</span> The group would be created, and
            BigCommerce would assign it a new numeric id. That id is written back into the mapping table so
            future operations can find it.
          </p>
          <p>
            <span className="font-medium text-foreground">Conflict.</span> A near-identical name exists.
            Deploying blindly would create a duplicate group and split the customer base, so the deployment is
            blocked until a human decides which to keep.
          </p>
          <p className="pt-2">
            Group writes are currently <CapabilityBadge status="NOT_IMPLEMENTED" showIcon={false} />: the
            comparison, mapping and dry-run all work, and the plan shows exactly what would change.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
