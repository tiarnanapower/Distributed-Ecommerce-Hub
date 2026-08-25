'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ExternalLink,
  GitCompareArrows,
  Grid3x3,
  Layers,
  RefreshCw,
  Rows3,
  Star,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable, type FacetFilter } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/states';
import { HealthBadge, HealthDot } from '@/components/shared/status-badges';
import type { StoreDirectoryRow } from '@/server/services/stores';
import { HIERARCHY_MODE_LABELS, type HierarchyMode } from '@/lib/enums';
import { formatMoneyString } from '@/lib/money';
import { cn, countryFlag, countryName, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string[]>;
  isShared: boolean;
}

export function StoreDirectory({
  stores,
  savedViews,
  initialHealthFilter,
  initialView,
}: {
  stores: StoreDirectoryRow[];
  savedViews: SavedView[];
  initialHealthFilter?: string;
  initialView?: string;
}) {
  const [view, setView] = useState<'grid' | 'table'>(initialView === 'table' ? 'table' : 'grid');
  const [activeSavedView, setActiveSavedView] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<string[]>(
    initialHealthFilter ? initialHealthFilter.split(',') : [],
  );

  const filtered = useMemo(() => {
    if (quickFilter.length === 0) return stores;
    return stores.filter((store) => quickFilter.includes(store.healthStatus));
  }, [stores, quickFilter]);

  const facets: FacetFilter[] = useMemo(
    () => [
      {
        columnId: 'companyName',
        label: 'Companies',
        options: unique(stores.map((store) => store.companyName)).map((value) => ({
          value,
          label: value,
        })),
      },
      {
        columnId: 'healthStatus',
        label: 'Health',
        options: [
          { value: 'HEALTHY', label: 'Healthy' },
          { value: 'WARNING', label: 'Needs attention' },
          { value: 'CRITICAL', label: 'Critical' },
          { value: 'UNKNOWN', label: 'Unknown' },
        ],
      },
      {
        columnId: 'hierarchyMode',
        label: 'Hierarchy',
        options: unique(stores.map((store) => store.hierarchyMode)).map((value) => ({
          value,
          label: HIERARCHY_MODE_LABELS[value as HierarchyMode] ?? value,
        })),
      },
      {
        columnId: 'environmentName',
        label: 'Environments',
        options: unique(stores.map((store) => store.environmentName ?? 'Unassigned')).map((value) => ({
          value,
          label: value,
        })),
      },
      {
        columnId: 'countryCode',
        label: 'Countries',
        options: unique(stores.map((store) => store.countryCode)).map((value) => ({
          value,
          label: countryName(value),
        })),
      },
    ],
    [stores],
  );

  const columns = useMemo<ColumnDef<StoreDirectoryRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Store',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/stores/${row.original.id}`}
              className="flex items-center gap-1.5 font-medium hover:underline"
            >
              <HealthDot status={row.original.healthStatus} />
              <span aria-hidden>{countryFlag(row.original.countryCode)}</span>
              <span className="truncate">{row.original.name}</span>
              {row.original.hierarchyMode === 'MASTER' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Star className="h-3 w-3 shrink-0 fill-warning text-warning" aria-label="Master store" />
                  </TooltipTrigger>
                  <TooltipContent>Master store — other stores inherit from this one.</TooltipContent>
                </Tooltip>
              ) : null}
            </Link>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {row.original.storeHash ?? 'Not yet provisioned'}
            </p>
          </div>
        ),
      },
      { accessorKey: 'companyName', header: 'Company', cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span> },
      {
        accessorKey: 'regionName',
        header: 'Region',
        cell: ({ getValue }) => (getValue() as string | null) ?? '—',
      },
      {
        accessorKey: 'countryCode',
        header: 'Country',
        cell: ({ getValue }) => countryName(String(getValue())),
      },
      { accessorKey: 'brandName', header: 'Brand', cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      { accessorKey: 'currencyCode', header: 'Currency' },
      { accessorKey: 'locale', header: 'Locale' },
      {
        accessorKey: 'environmentName',
        header: 'Environment',
        cell: ({ row }) => (
          <Badge variant={row.original.isProduction ? 'default' : 'muted'} size="sm">
            {row.original.environmentName ?? 'Unassigned'}
          </Badge>
        ),
      },
      {
        accessorKey: 'classification',
        header: 'Store type',
        cell: ({ getValue }) => titleCase(String(getValue())),
      },
      {
        accessorKey: 'hierarchyMode',
        header: 'Inheritance',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Badge variant="secondary" size="sm">
              {HIERARCHY_MODE_LABELS[row.original.hierarchyMode as HierarchyMode] ?? row.original.hierarchyMode}
            </Badge>
            {row.original.masterName ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">from {row.original.masterName}</p>
            ) : row.original.templateName ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                template {row.original.templateName}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'healthStatus',
        header: 'Health',
        cell: ({ row }) => <HealthBadge status={row.original.healthStatus} />,
      },
      {
        accessorKey: 'lastSuccessfulSyncAt',
        header: 'Last sync',
        cell: ({ row }) => (
          <span
            className={cn(
              'text-xs',
              row.original.lastErrorSummary ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {formatRelativeTime(row.original.lastSuccessfulSyncAt)}
          </span>
        ),
        sortingFn: (a, b) =>
          (a.original.lastSuccessfulSyncAt?.getTime() ?? 0) -
          (b.original.lastSuccessfulSyncAt?.getTime() ?? 0),
      },
      {
        accessorKey: 'revenue',
        header: 'Revenue (30d)',
        cell: ({ row }) => (
          <span className="tabular">
            {formatMoneyString(row.original.revenue, row.original.currencyCode, { compact: true })}
          </span>
        ),
        sortingFn: (a, b) => Number(a.original.revenue) - Number(b.original.revenue),
      },
      {
        accessorKey: 'orders',
        header: 'Orders (30d)',
        cell: ({ getValue }) => <span className="tabular">{formatNumber(Number(getValue()))}</span>,
      },
      {
        accessorKey: 'themeName',
        header: 'Theme',
        cell: ({ row }) =>
          row.original.themeName ? (
            <span className="text-xs">
              {row.original.themeName}
              <span className="ml-1 text-muted-foreground">{row.original.themeVersion}</span>
            </span>
          ) : (
            '—'
          ),
      },
      {
        accessorKey: 'catalogVersion',
        header: 'Catalog version',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {(getValue() as string | null) ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'openConflicts',
        header: 'Open conflicts',
        cell: ({ row }) =>
          row.original.openConflicts > 0 ? (
            <Link href={`/conflicts?store=${row.original.id}`}>
              <Badge variant="warning" size="sm">
                {row.original.openConflicts}
              </Badge>
            </Link>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {/* View toggle, saved views and quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1.5 px-2 text-xs', view === 'grid' && 'bg-secondary')}
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
          >
            <Grid3x3 className="h-3.5 w-3.5" aria-hidden />
            Grid
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1.5 px-2 text-xs', view === 'table' && 'bg-secondary')}
            onClick={() => setView('table')}
            aria-pressed={view === 'table'}
          >
            <Rows3 className="h-3.5 w-3.5" aria-hidden />
            Table
          </Button>
        </div>

        {savedViews.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Saved views:</span>
            {savedViews.map((saved) => (
              <Button
                key={saved.id}
                variant="outline"
                size="sm"
                className={cn('h-7 px-2 text-xs', activeSavedView === saved.id && 'border-primary bg-primary/5')}
                onClick={() => {
                  if (activeSavedView === saved.id) {
                    setActiveSavedView(null);
                    setQuickFilter([]);
                    return;
                  }
                  setActiveSavedView(saved.id);
                  setQuickFilter(saved.filters.healthStatus ?? []);
                }}
              >
                {saved.name}
                {saved.isShared ? (
                  <Badge variant="muted" size="sm" className="ml-1">
                    Shared
                  </Badge>
                ) : null}
              </Button>
            ))}
          </div>
        ) : null}

        {quickFilter.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setQuickFilter([]);
              setActiveSavedView(null);
            }}
          >
            Clear health filter ({quickFilter.join(', ').toLowerCase()})
          </Button>
        ) : null}
      </div>

      {view === 'table' ? (
        <DataTable
          columns={columns}
          data={filtered}
          searchColumnId="name"
          searchPlaceholder="Filter by store name…"
          facets={facets}
          enableSelection
          exportFilename="stores"
          exportRow={(store) => ({
            name: store.name,
            storeHash: store.storeHash,
            company: store.companyName,
            region: store.regionName,
            country: store.countryCode,
            brand: store.brandName,
            currency: store.currencyCode,
            locale: store.locale,
            environment: store.environmentName,
            storeType: store.classification,
            hierarchy: store.hierarchyMode,
            master: store.masterName,
            health: store.healthStatus,
            lastSync: store.lastSuccessfulSyncAt,
            revenue30d: store.revenue,
            orders30d: store.orders,
            theme: `${store.themeName ?? ''} ${store.themeVersion ?? ''}`.trim(),
            openConflicts: store.openConflicts,
          })}
          bulkActions={(selected) => (
            <>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                <Link href={`/conflicts?stores=${selected.map((store) => store.id).join(',')}`}>
                  <GitCompareArrows className="h-3.5 w-3.5" aria-hidden />
                  Compare selected
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                <Link href={`/deployments/new?targets=${selected.map((store) => store.id).join(',')}`}>
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                  Create deployment
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                <Link href={`/sync?action=full&targets=${selected.map((store) => store.id).join(',')}`}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Sync selected
                </Link>
              </Button>
            </>
          )}
          emptyTitle="No stores match these filters"
          emptyDescription="Adjust the filters above, or connect a new store to get started."
        />
      ) : (
        <StoreGrid stores={filtered} />
      )}
    </div>
  );
}

function StoreGrid({ stores }: { stores: StoreDirectoryRow[] }) {
  if (stores.length === 0) {
    return (
      <EmptyState
        title="No stores match these filters"
        description="Adjust the filters above, or connect a new store to get started."
        action={{ label: 'Add a store', href: '/stores/new' }}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stores.map((store) => (
        <Card
          key={store.id}
          className={cn(
            'transition-colors hover:border-primary/40',
            store.healthStatus === 'CRITICAL' && 'border-destructive/40',
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/stores/${store.id}`} className="group flex items-center gap-1.5">
                  <span className="text-lg" aria-hidden>
                    {countryFlag(store.countryCode)}
                  </span>
                  <span className="truncate font-semibold group-hover:underline">{store.name}</span>
                  {store.hierarchyMode === 'MASTER' ? (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label="Master store" />
                  ) : null}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {store.companyName}
                  {store.regionName ? ` · ${store.regionName}` : ''}
                </p>
              </div>
              <HealthBadge status={store.healthStatus} />
            </div>

            {store.healthStatus !== 'HEALTHY' && store.healthMessage ? (
              <p className="mt-3 flex gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                <span className="line-clamp-3">{store.healthMessage}</span>
              </p>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Revenue (30d)</dt>
                <dd className="tabular font-medium">
                  {formatMoneyString(store.revenue, store.currencyCode, { compact: true })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Orders (30d)</dt>
                <dd className="tabular font-medium">{formatNumber(store.orders)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Products</dt>
                <dd className="tabular font-medium">{formatNumber(store.productCount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Storefronts</dt>
                <dd className="tabular font-medium">
                  {store.activeChannelCount}
                  {store.storefrontLimit ? (
                    <span className="text-muted-foreground"> / {store.storefrontLimit}</span>
                  ) : null}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge variant="secondary" size="sm">
                {HIERARCHY_MODE_LABELS[store.hierarchyMode as HierarchyMode] ?? store.hierarchyMode}
              </Badge>
              <Badge variant="muted" size="sm">
                {store.currencyCode}
              </Badge>
              {store.msfEnabled ? (
                <Badge variant="info" size="sm">
                  Multi-Storefront
                </Badge>
              ) : null}
              {!store.isProduction ? (
                <Badge variant="warning" size="sm">
                  {store.environmentName}
                </Badge>
              ) : null}
              {store.openConflicts > 0 ? (
                <Badge variant="warning" size="sm">
                  {store.openConflicts} conflict{store.openConflicts === 1 ? '' : 's'}
                </Badge>
              ) : null}
              {store.overrideCount > 0 ? (
                <Badge variant="outline" size="sm">
                  {store.overrideCount} override{store.overrideCount === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">
                Synced {formatRelativeTime(store.lastSuccessfulSyncAt)}
              </span>
              <div className="flex gap-1">
                {store.primaryDomain ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" asChild>
                        <a
                          href={`https://${store.primaryDomain}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Open ${store.primaryDomain}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open the storefront: {store.primaryDomain}</TooltipContent>
                  </Tooltip>
                ) : null}
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <Link href={`/stores/${store.id}`}>Open</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
