import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Globe,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { EmptyState, InfoNote, UnavailableState, WarningNote } from '@/components/shared/states';
import {
  CapabilityBadge,
  ConflictTypeBadge,
  ContentStatusBadge,
  DataSourceBadge,
  HealthBadge,
  JobStatusBadge,
} from '@/components/shared/status-badges';
import { CAPABILITY_DEFINITIONS, CAPABILITY_GROUPS } from '@/lib/commerce/capability-registry';
import type { CapabilityKey } from '@/lib/commerce/capability-keys';
import { RESOURCE_CATEGORY_LIST } from '@/lib/resource-categories';
import { INHERITANCE_MODE_DESCRIPTIONS, INHERITANCE_MODE_LABELS, type InheritanceMode } from '@/lib/enums';
import { formatMoneyString } from '@/lib/money';
import {
  countryFlag,
  countryName,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  titleCase,
  truncate,
} from '@/lib/utils';
import type { StoreDetail } from '@/server/services/stores';
import { parseThemeConfig } from '@/server/services/stores';
import { parseJsonLoose } from '@/lib/json';

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function SummaryPanel({
  store,
  metrics,
  effectiveModes,
}: {
  store: StoreDetail;
  metrics: { revenue: string; orders: number; aov: string; currencyCode: string };
  effectiveModes: { category: string; label: string; mode: InheritanceMode; isDefault: boolean }[];
}) {
  const inheritedCategories = effectiveModes.filter(
    (entry) => entry.mode !== 'DO_NOT_INHERIT' && entry.mode !== 'READ_ONLY_COMPARISON',
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Store identity</CardTitle>
          <CardDescription>
            What BigCommerce knows about this store, and where it sits in your organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 sm:grid-cols-2">
            <dl className="divide-y">
              <StatRow
                label="BigCommerce store hash"
                value={<span className="font-mono text-xs">{store.storeHash ?? 'Not provisioned'}</span>}
                tooltip="The store's identifier in BigCommerce. Every API call is scoped to it."
              />
              <StatRow label="Connection type" value={titleCase(store.connectionType)} />
              <StatRow label="Store type" value={titleCase(store.classification)} />
              <StatRow label="Plan" value={store.platformPlan ?? '—'} />
              <StatRow
                label="Multi-Storefront"
                value={
                  store.msfEnabled ? (
                    <Badge variant="info" size="sm">
                      Enabled
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Not enabled</span>
                  )
                }
                tooltip="Whether this store can host more than one storefront channel. This depends on the store's plan."
              />
              <StatRow
                label="Storefront capacity"
                value={
                  store.storefrontLimit
                    ? `${store.storefrontsUsed ?? 0} of ${store.storefrontLimit} in use`
                    : '—'
                }
              />
            </dl>
            <dl className="divide-y">
              <StatRow label="Company" value={store.company.name} />
              <StatRow label="Region" value={store.region?.name ?? 'Unassigned'} />
              <StatRow label="Brand" value={store.brand?.name ?? 'Unassigned'} />
              <StatRow
                label="Environment"
                value={
                  <Badge variant={store.environment?.isProduction ? 'default' : 'warning'} size="sm">
                    {store.environment?.name ?? 'Unassigned'}
                  </Badge>
                }
              />
              <StatRow
                label="Country and currency"
                value={
                  <span>
                    {countryFlag(store.countryCode)} {countryName(store.countryCode)} ·{' '}
                    {store.currencyCode}
                  </span>
                }
              />
              <StatRow label="Locale and timezone" value={`${store.locale} · ${store.timezone}`} />
            </dl>
          </div>

          {store.notes ? (
            <p className="mt-4 rounded-md bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
              {store.notes}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Trading (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <StatRow
                label="Revenue"
                value={formatMoneyString(metrics.revenue, metrics.currencyCode, { compact: true })}
              />
              <StatRow label="Orders" value={formatNumber(metrics.orders)} />
              <StatRow label="Average order value" value={formatMoneyString(metrics.aov, metrics.currencyCode)} />
              <StatRow label="Products" value={formatNumber(store._count.products)} />
              <StatRow label="Customers" value={formatNumber(store._count.customers)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Connection health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthBadge status={store.healthStatus} />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {store.healthMessage ?? 'No health information has been recorded yet.'}
            </p>
            <dl className="divide-y">
              <StatRow label="Last successful sync" value={formatRelativeTime(store.lastSuccessfulSyncAt)} />
              <StatRow label="Last failed sync" value={formatRelativeTime(store.lastFailedSyncAt)} />
              <StatRow label="Last verified" value={formatRelativeTime(store.lastVerifiedAt)} />
            </dl>
            {store.lastErrorSummary ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-xs leading-relaxed text-destructive">
                {store.lastErrorSummary}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Hierarchy */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Position in the hierarchy</CardTitle>
          <CardDescription>
            {store.master
              ? `This store inherits selected resource categories from ${store.master.name}.`
              : store.template
                ? `This store was built from the ${store.template.name} template.`
                : store.children.length > 0
                  ? 'This store is a master. Other stores inherit from it.'
                  : 'This store operates independently. Nothing flows into or out of it automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Inherits from
              </p>
              {store.master ? (
                <Link
                  href={`/stores/${store.master.id}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary/40"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{store.master.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </Link>
              ) : store.template ? (
                <div className="rounded-md border px-3 py-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {store.template.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Version {store.template.version}</p>
                </div>
              ) : (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Nothing — this store is a source or fully independent.
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stores inheriting from this one
              </p>
              {store.children.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  None.
                </p>
              ) : (
                <ul className="space-y-1">
                  {store.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/stores/${child.id}`}
                        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:border-primary/40"
                      >
                        <span aria-hidden>{countryFlag(child.countryCode)}</span>
                        <span className="min-w-0 flex-1 truncate">{child.name}</span>
                        <HealthBadge status={child.healthStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Store groups
              </p>
              {store.groupMemberships.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Not a member of any group.
                </p>
              ) : (
                <ul className="space-y-1">
                  {store.groupMemberships.map((membership) => (
                    <li key={membership.id}>
                      <Link
                        href={`/store-groups/${membership.storeGroup.id}`}
                        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:border-primary/40"
                      >
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{membership.storeGroup.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {inheritedCategories.length > 0 ? (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Inherited resource categories ({inheritedCategories.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inheritedCategories.map((entry) => (
                  <Badge key={entry.category} variant="secondary" size="sm" title={INHERITANCE_MODE_DESCRIPTIONS[entry.mode]}>
                    {entry.label}: {INHERITANCE_MODE_LABELS[entry.mode]}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configuration — the effective-value table with provenance
// ---------------------------------------------------------------------------

export function ConfigurationPanel({
  store,
  rows,
}: {
  store: StoreDetail;
  rows: {
    category: string;
    label: string;
    mode: InheritanceMode;
    isDefaultPolicy: boolean;
    automation: string;
    channelVariable: boolean;
    provenance: string;
    origin: string;
    isOverridden: boolean;
    isSourceStale: boolean;
    isUnsupported: boolean;
    note: string;
    apiSurface: string;
  }[];
}) {
  return (
    <div className="space-y-4">
      <InfoNote>
        Each row shows the inheritance mode in force for this store and where its effective value comes from.
        Modes are resolved most-specific-first: store, then store group, region, company, and finally the
        organisation default.
      </InfoNote>

      {store.manualActions.length > 0 ? (
        <Card className="border-warning/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Wrench className="h-4 w-4 text-warning" aria-hidden />
              Manual actions outstanding ({store.manualActions.length})
            </CardTitle>
            <CardDescription>
              These changes have no supported public API. Record the intent here, make the change in the
              BigCommerce control panel, then tick it off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {store.manualActions.map((action) => (
              <div key={action.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium">{action.title}</p>
                  <Badge variant="warning" size="sm">
                    {action.category}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{action.description}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium">Why it cannot be automated:</span> {action.reason}
                </p>
                <dl className="mt-2 grid gap-x-6 text-xs sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Current</dt>
                    <dd className="font-medium">{action.currentValue ?? 'Unknown'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Desired</dt>
                    <dd className="font-medium">{action.desiredValue ?? '—'}</dd>
                  </div>
                </dl>
                {action.docsUrl ? (
                  <a
                    href={action.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    BigCommerce documentation
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource category</TableHead>
              <TableHead>Inheritance mode</TableHead>
              <TableHead>Effective value origin</TableHead>
              <TableHead>Automation</TableHead>
              <TableHead>Per-channel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.category}>
                <TableCell>
                  <p className="font-medium">{row.label}</p>
                  <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">{row.note}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{row.apiSurface}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" size="sm" title={INHERITANCE_MODE_DESCRIPTIONS[row.mode]}>
                    {INHERITANCE_MODE_LABELS[row.mode]}
                  </Badge>
                  {row.isDefaultPolicy ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">Organisation default</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <p className="max-w-xs text-xs leading-relaxed">{row.provenance}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.isOverridden ? (
                      <Badge variant="warning" size="sm">
                        Overridden locally
                      </Badge>
                    ) : null}
                    {row.isSourceStale ? (
                      <Badge variant="destructive" size="sm">
                        Source changed since
                      </Badge>
                    ) : null}
                    {row.isUnsupported ? (
                      <Badge variant="muted" size="sm">
                        Not supported by connected store
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.automation === 'AUTOMATED'
                        ? 'success'
                        : row.automation === 'PARTIAL'
                          ? 'warning'
                          : row.automation === 'MANUAL'
                            ? 'info'
                            : 'muted'
                    }
                    size="sm"
                  >
                    {titleCase(row.automation)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.channelVariable ? (
                    <Badge variant="info" size="sm">
                      Yes
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Shared by all channels</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {store.overrides.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Local overrides ({store.overrides.length})</CardTitle>
            <CardDescription>
              Values this store deliberately sets for itself, stored separately from the inherited value.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Set</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.overrides.map((override) => (
                  <TableRow key={override.id}>
                    <TableCell>
                      <p className="font-medium">{override.resourceLabel ?? override.resourceKey}</p>
                      <p className="font-mono text-xs text-muted-foreground">{override.resourceKey}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {titleCase(override.resourceCategory)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">
                        {truncate(JSON.stringify(parseJsonLoose(override.valueJson, {})), 40)}
                      </code>
                      {override.previousValueJson ? (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground line-through">
                          {truncate(JSON.stringify(parseJsonLoose(override.previousValueJson, {})), 40)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-xs leading-relaxed text-muted-foreground">{override.reason ?? '—'}</p>
                      {override.sourceChangedAt ? (
                        <Badge variant="warning" size="sm" className="mt-1">
                          Master changed {formatRelativeTime(override.sourceChangedAt)}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelativeTime(override.setAt)}
                      {override.setBy ? <p>by {override.setBy.name}</p> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storefronts
// ---------------------------------------------------------------------------

export function StorefrontsPanel({ store }: { store: StoreDetail }) {
  if (!store.msfEnabled && store.channels.length <= 1) {
    return (
      <div className="space-y-4">
        <UnavailableState
          title="This store has a single storefront"
          reason={
            <>
              The store does not report Multi-Storefront support, so it serves exactly one storefront. Adding
              storefront channels requires Multi-Storefront and an available storefront seat on the store plan —
              a commercial entitlement rather than a setting this platform can change.
            </>
          }
          docsHref="https://docs.bigcommerce.com/docs/start/about"
          icon={Globe}
        />
        {store.channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} />
        ))}
      </div>
    );
  }

  const capacity =
    store.storefrontLimit && store.storefrontsUsed !== null
      ? (store.storefrontsUsed / store.storefrontLimit) * 100
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Storefront capacity</CardTitle>
          <CardDescription>
            Storefront seats are a commercial entitlement on the store plan. Creating a channel can have billing
            consequences, so this platform never creates one without an explicit, confirmed action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {capacity !== null ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="tabular text-2xl font-semibold">
                  {store.storefrontsUsed} <span className="text-base text-muted-foreground">of {store.storefrontLimit}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {store.storefrontLimit! - (store.storefrontsUsed ?? 0)} seat(s) available
                </span>
              </div>
              <Progress value={capacity} className="mt-2" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This store did not report a storefront limit, so capacity is unknown.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {store.channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} />
        ))}
      </div>
    </div>
  );
}

function ChannelCard({ channel }: { channel: StoreDetail['channels'][number] }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold">
              <span aria-hidden>{countryFlag(channel.countryCode)}</span>
              <span className="truncate">{channel.name}</span>
              {channel.isDefault ? (
                <Badge variant="muted" size="sm">
                  Default
                </Badge>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Channel {channel.externalChannelId ?? '—'} · {titleCase(channel.channelType)} on{' '}
              {channel.platform}
            </p>
          </div>
          <Badge
            variant={
              channel.status === 'active' ? 'success' : channel.status === 'prelaunch' ? 'warning' : 'muted'
            }
          >
            {titleCase(channel.status)}
          </Badge>
        </div>

        <dl className="mt-4 divide-y">
          <StatRow label="Currency" value={channel.currencyCode} />
          <StatRow label="Locale" value={channel.locale} />
          <StatRow
            label="Catalog assignment"
            value={
              channel.catalogMode === 'ALL_PRODUCTS'
                ? 'All products'
                : channel.catalogMode === 'ASSIGNED_ONLY'
                  ? 'Assigned products only'
                  : 'Unknown'
            }
            tooltip="Product records are shared by every channel in the store. A channel controls which products are listed, not their underlying fields."
          />
          <StatRow label="Theme" value={channel.themeName ?? '—'} />
        </dl>

        {channel.notes ? (
          <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {channel.notes}
          </p>
        ) : null}

        {channel.siteUrl ? (
          <a
            href={channel.siteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {channel.siteUrl.replace(/^https?:\/\//, '')}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export function CredentialsPanel({ store }: { store: StoreDetail }) {
  return (
    <div className="space-y-4">
      <Card className="border-info/30 bg-info/[0.03]">
        <CardContent className="flex gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Secrets are never shown here</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Stored credentials are encrypted with AES-256-GCM and can only be decrypted server-side, at the
              moment an API call is made. This page shows a masked hint and a fingerprint so you can confirm
              which token is in use — the value itself is not retrievable through any route.
            </p>
          </div>
        </CardContent>
      </Card>

      {store.credentials.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No credentials stored"
          description="This store has no API account token, so no live data can be read from it."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credential</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last validated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.credentials.map((credential) => (
                <TableRow key={credential.id}>
                  <TableCell>
                    <p className="font-medium">{credential.label}</p>
                    <p className="text-xs text-muted-foreground">{titleCase(credential.credentialType)}</p>
                  </TableCell>
                  <TableCell>
                    <code className="flex items-center gap-1.5 font-mono text-xs">
                      <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                      {credential.maskedHint}
                    </code>
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">{credential.fingerprint}</code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        credential.status === 'ACTIVE'
                          ? 'success'
                          : credential.status === 'INVALID'
                            ? 'destructive'
                            : 'muted'
                      }
                    >
                      {titleCase(credential.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(credential.lastValidatedAt)}
                    </p>
                    {credential.lastValidationError ? (
                      <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-destructive">
                        {credential.lastValidationError}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Granted scopes</CardTitle>
          <CardDescription>
            Reported by the stored credential. A missing scope downgrades the affected capabilities rather than
            hiding them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {parseJsonLoose<string[]>(store.credentials[0]?.scopesJson ?? '[]', []).map((scope) => (
              <code key={scope} className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {scope}
              </code>
            ))}
            {parseJsonLoose<string[]>(store.credentials[0]?.scopesJson ?? '[]', []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No scopes have been recorded for this store.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export function CapabilitiesPanel({ store }: { store: StoreDetail }) {
  const byGroup = new Map<string, typeof store.capabilities>();
  for (const capability of store.capabilities) {
    const definition = CAPABILITY_DEFINITIONS[capability.capabilityKey as CapabilityKey];
    const group = definition?.group ?? 'Other';
    byGroup.set(group, [...(byGroup.get(group) ?? []), capability]);
  }

  const available = store.capabilities.filter((entry) => entry.status === 'AVAILABLE').length;
  const missing = store.capabilities.filter((entry) => entry.status === 'PERMISSION_MISSING').length;

  return (
    <div className="space-y-4">
      <InfoNote>
        This matrix is the platform&rsquo;s honest account of what it can do to this store. A capability is only
        ever shown as <span className="font-medium">Available</span> when the operation is implemented, the
        required OAuth scope is granted and the store supports it. Everything else states the reason.
      </InfoNote>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Available now</p>
            <p className="tabular mt-1 text-2xl font-semibold text-success">{available}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Blocked by permissions</p>
            <p className="tabular mt-1 text-2xl font-semibold text-destructive">{missing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total capabilities tracked</p>
            <p className="tabular mt-1 text-2xl font-semibold">{store.capabilities.length}</p>
          </CardContent>
        </Card>
      </div>

      {CAPABILITY_GROUPS.map((group) => {
        const capabilities = byGroup.get(group);
        if (!capabilities || capabilities.length === 0) return null;
        return (
          <Card key={group}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{group}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Capability</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Required scope</TableHead>
                    <TableHead>Guard rails</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {capabilities.map((capability) => {
                    const definition = CAPABILITY_DEFINITIONS[capability.capabilityKey as CapabilityKey];
                    return (
                      <TableRow key={capability.id}>
                        <TableCell className="max-w-sm">
                          <p className="font-medium">{definition?.label ?? capability.capabilityKey}</p>
                          {capability.unavailableReason ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {capability.unavailableReason}
                            </p>
                          ) : null}
                          {definition ? (
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {definition.apiSurface}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <CapabilityBadge status={capability.status} />
                          {capability.planDependency ? (
                            <p className="mt-1 max-w-[14rem] text-xs leading-relaxed text-muted-foreground">
                              {capability.planDependency}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {capability.requiredScope ? (
                            <code className="font-mono text-xs">{capability.requiredScope}</code>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not applicable</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {capability.requiresConfirmation ? (
                              <Badge variant="warning" size="sm">
                                Confirmation required
                              </Badge>
                            ) : null}
                            {!capability.isReversible ? (
                              <Badge variant="destructive" size="sm">
                                Not reversible
                              </Badge>
                            ) : null}
                            {capability.channelApplicable ? (
                              <Badge variant="info" size="sm">
                                Per-channel
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatRelativeTime(capability.lastVerifiedAt)}
                          <p>{titleCase(capability.verificationSource)}</p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export function ThemePanel({ store }: { store: StoreDetail }) {
  const assignment = store.themeAssignments[0];

  if (!assignment) {
    return (
      <EmptyState
        title="No theme information"
        description="This store has no recorded theme assignment. Run a metadata sync to capture it."
      />
    );
  }

  const config = parseThemeConfig(assignment.configSnapshotJson);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Active theme</CardTitle>
          <CardDescription>
            Theme code is never merged automatically. Where local changes exist, the deployment workflow offers
            explicit choices rather than attempting a merge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold">{assignment.activeThemeName}</p>
            <Badge variant="secondary">{assignment.activeThemeVersion}</Badge>
            <Badge variant={assignment.state === 'ACTIVE' ? 'success' : 'muted'}>
              {titleCase(assignment.state)}
            </Badge>
            {assignment.hasLocalModifications ? (
              <Badge variant="warning">Local modifications</Badge>
            ) : null}
          </div>

          {assignment.hasLocalModifications ? (
            <WarningNote className="mt-4">
              <span className="font-medium">This store has local template changes.</span>{' '}
              {assignment.localModificationSummary} Deploying a managed release over this store would discard
              them, so the deployment workflow holds it back for developer review.
            </WarningNote>
          ) : null}

          <dl className="mt-4 divide-y">
            <StatRow
              label="Managed release"
              value={
                assignment.release ? (
                  <Link href="/themes" className="text-primary hover:underline">
                    {assignment.release.name} {assignment.release.version}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unmanaged — not tracked as a release</span>
                )
              }
            />
            <StatRow
              label="Theme UUID"
              value={<span className="font-mono text-xs">{assignment.externalThemeUuid ?? '—'}</span>}
            />
            <StatRow label="Deployed" value={formatRelativeTime(assignment.deployedAt)} />
          </dl>

          {assignment.previewUrl ? (
            <Button variant="outline" size="sm" asChild className="mt-4">
              <a href={assignment.previewUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open theme preview
              </a>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Theme configuration snapshot</CardTitle>
          <CardDescription>
            Configuration keys differ between themes and versions, so they are only copied between compatible
            versions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {Object.entries(config).map(([key, value]) => (
              <StatRow
                key={key}
                label={key}
                value={<code className="font-mono text-xs">{String(value)}</code>}
              />
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic list panels
// ---------------------------------------------------------------------------

export function SyncHistoryPanel({
  jobs,
}: {
  jobs: {
    id: string;
    jobType: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    successCount: number;
    failureCount: number;
    errorSummary: string | null;
    isDryRun: boolean;
    correlationId: string;
  }[];
}) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No sync history"
        description="No job has targeted this store yet. Jobs appear here as soon as one runs."
        action={{ label: 'Open the Sync Centre', href: '/sync' }}
      />
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Succeeded</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Correlation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <Link href={`/sync/${job.id}`} className="font-medium hover:underline">
                  {titleCase(job.jobType)}
                </Link>
                {job.isDryRun ? (
                  <Badge variant="info" size="sm" className="ml-2">
                    Dry run
                  </Badge>
                ) : null}
                {job.errorSummary ? (
                  <p className="mt-0.5 max-w-md text-xs leading-relaxed text-destructive">{job.errorSummary}</p>
                ) : null}
              </TableCell>
              <TableCell>
                <JobStatusBadge status={job.status} />
              </TableCell>
              <TableCell className="tabular text-right">{job.successCount}</TableCell>
              <TableCell className="tabular text-right">{job.failureCount}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatRelativeTime(job.startedAt)}
              </TableCell>
              <TableCell>
                <code className="font-mono text-xs text-muted-foreground">{job.correlationId}</code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function AuditHistoryPanel({
  events,
}: {
  events: {
    id: string;
    action: string;
    resourceLabel: string | null;
    outcome: string;
    actorLabel: string | null;
    beforeSummary: string | null;
    afterSummary: string | null;
    createdAt: Date;
  }[];
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No audit history"
        description="No recorded action has touched this store yet."
      />
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <code className="font-mono text-xs">{event.action}</code>
                <p className="mt-0.5 text-xs text-muted-foreground">{event.actorLabel ?? 'System'}</p>
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="truncate text-sm">{event.resourceLabel ?? '—'}</p>
              </TableCell>
              <TableCell className="max-w-sm">
                {event.beforeSummary ? (
                  <p className="truncate font-mono text-xs text-muted-foreground line-through">
                    {event.beforeSummary}
                  </p>
                ) : null}
                {event.afterSummary ? (
                  <p className="truncate font-mono text-xs">{event.afterSummary}</p>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    event.outcome === 'SUCCESS'
                      ? 'success'
                      : event.outcome === 'FAILURE'
                        ? 'destructive'
                        : event.outcome === 'PARTIAL'
                          ? 'warning'
                          : 'info'
                  }
                  size="sm"
                >
                  {titleCase(event.outcome)}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ConflictsPanel({
  conflicts,
  storeName,
}: {
  conflicts: {
    id: string;
    resourceCategory: string;
    conflictType: string;
    resourceLabel: string | null;
    resourceKey: string;
    severity: string;
    status: string;
    detectedAt: Date;
  }[];
  storeName: string;
}) {
  if (conflicts.length === 0) {
    return (
      <EmptyState
        title="No open differences"
        description={`${storeName} matches its source on every compared resource.`}
      />
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Detected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conflicts.map((conflict) => (
            <TableRow key={conflict.id}>
              <TableCell>
                <Link href={`/conflicts/${conflict.id}`} className="font-medium hover:underline">
                  {conflict.resourceLabel ?? conflict.resourceKey}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">{conflict.resourceKey}</p>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" size="sm">
                  {titleCase(conflict.resourceCategory)}
                </Badge>
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
                        : 'muted'
                  }
                  size="sm"
                >
                  {titleCase(conflict.severity)}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatRelativeTime(conflict.detectedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ContentPanel({
  content,
  source,
}: {
  content: {
    id: string;
    contentType: string;
    title: string;
    contentKey: string;
    status: string;
    isOverride: boolean;
    scheduledFor: Date | null;
    publishedAt: Date | null;
  }[];
  source: 'DEMO' | 'LIVE';
}) {
  if (content.length === 0) {
    return <EmptyState title="No content captured" description="Run a content sync to capture this store's pages, widgets, scripts and redirects." />;
  }

  const byType = new Map<string, typeof content>();
  for (const item of content) {
    byType.set(item.contentType, [...(byType.get(item.contentType) ?? []), item]);
  }

  return (
    <div className="space-y-4">
      <DataSourceBadge source={source} />
      {[...byType.entries()].map(([type, items]) => (
        <Card key={type}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {titleCase(type)} ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Published</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.title}</p>
                      {item.isOverride ? (
                        <Badge variant="warning" size="sm" className="mt-0.5">
                          Local override
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">{item.contentKey}</code>
                    </TableCell>
                    <TableCell>
                      <ContentStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {item.scheduledFor
                        ? `Scheduled ${formatRelativeTime(item.scheduledFor)}`
                        : formatRelativeTime(item.publishedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { RESOURCE_CATEGORY_LIST };
