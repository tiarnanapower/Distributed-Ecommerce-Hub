import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink, GitCompareArrows, RefreshCw, Rocket } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { DataSourceBadge, HealthBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { isStoreTab, type StoreTabId } from '@/lib/navigation';
import { loadStoreDetail, parseMetrics } from '@/server/services/stores';
import { effectiveMode, resolveEffectiveValue, type PolicyRecord } from '@/lib/inheritance/resolver';
import { RESOURCE_CATEGORY_LIST } from '@/lib/resource-categories';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatDate, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';
import { StoreTabs } from './store-tabs';
import {
  AuditHistoryPanel,
  CapabilitiesPanel,
  ConfigurationPanel,
  ConflictsPanel,
  ContentPanel,
  CredentialsPanel,
  StorefrontsPanel,
  SummaryPanel,
  SyncHistoryPanel,
  ThemePanel,
} from './tab-panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const store = await prisma.storeConnection.findUnique({ where: { id }, select: { name: true } });
  return { title: store?.name ?? 'Store' };
}

export default async function StoreDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const auth = await requireAuthOrRedirect(`/stores/${id}`);
  const scope = scopeFromAuth(auth);

  let store;
  try {
    store = await loadStoreDetail(scope, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const activeTab: StoreTabId = tab && isStoreTab(tab) ? tab : 'summary';
  const metrics = parseMetrics(store.metricsJson);

  // Inheritance policies that could apply to this store, most specific first.
  const policies = await prisma.inheritancePolicy.findMany({
    where: {
      organisationId: scope.organisationId,
      OR: [
        { scopeType: 'ORGANISATION', scopeId: scope.organisationId },
        { scopeType: 'COMPANY', scopeId: store.companyId },
        ...(store.regionId ? [{ scopeType: 'REGION', scopeId: store.regionId }] : []),
        { scopeType: 'STORE', scopeId: store.id },
        {
          scopeType: 'STORE_GROUP',
          scopeId: { in: store.groupMemberships.map((membership) => membership.storeGroupId) },
        },
      ],
    },
  });

  const policyRecords: PolicyRecord[] = policies.map((policy) => ({
    scopeType: policy.scopeType as PolicyRecord['scopeType'],
    scopeId: policy.scopeId,
    resourceCategory: policy.resourceCategory,
    mode: policy.mode as PolicyRecord['mode'],
    sourceType: policy.sourceType,
    sourceId: policy.sourceId,
    isActive: policy.isActive,
  }));

  const storeScope = {
    organisationId: scope.organisationId,
    companyId: store.companyId,
    regionId: store.regionId,
    storeGroupIds: store.groupMemberships.map((membership) => membership.storeGroupId),
    storeId: store.id,
  };

  const overridesByCategory = new Set(store.overrides.map((override) => override.resourceCategory));
  const staleCategories = new Set(
    store.overrides.filter((override) => override.sourceChangedAt).map((o) => o.resourceCategory),
  );
  const unsupportedCategories = new Map(
    store.capabilities
      .filter((capability) => capability.status === 'NOT_SUPPORTED')
      .map((capability) => [
        capability.capabilityKey,
        capability.unavailableReason ?? 'Not supported by BigCommerce.',
      ]),
  );

  const effectiveModes = RESOURCE_CATEGORY_LIST.map((meta) => {
    const { mode, isDefault } = effectiveMode(policyRecords, meta.key, storeScope);
    return { category: meta.key, label: meta.label, mode, isDefault };
  });

  const configurationRows = RESOURCE_CATEGORY_LIST.map((meta) => {
    const { mode, policy, isDefault } = effectiveMode(policyRecords, meta.key, storeScope);
    const hasOverride = overridesByCategory.has(meta.key);
    const isStale = staleCategories.has(meta.key);

    const resolved = resolveEffectiveValue({
      resourceCategory: meta.key,
      mode,
      overrideSetAt: hasOverride
        ? (store.overrides.find((o) => o.resourceCategory === meta.key)?.setAt ?? null)
        : null,
      unsupportedReason:
        meta.automation === 'UNSUPPORTED'
          ? 'BigCommerce does not expose a public API for this resource.'
          : (unsupportedCategories.get(meta.key) ?? null),
      layers: [
        ...(store.master
          ? [
              {
                layer: 'MASTER_STORE' as const,
                value: null,
                sourceLabel: store.master.name,
                sourceId: store.master.id,
                updatedAt: isStale ? new Date() : undefined,
              },
            ]
          : []),
        ...(store.template
          ? [
              {
                layer: 'COMPANY_TEMPLATE' as const,
                value: null,
                sourceLabel: store.template.name,
                sourceId: store.template.id,
              },
            ]
          : []),
        ...(policy && policy.scopeType === 'ORGANISATION'
          ? [
              {
                layer: 'ORGANISATION_TEMPLATE' as const,
                value: null,
                sourceLabel: 'Organisation default',
                sourceId: policy.scopeId,
              },
            ]
          : []),
        ...(hasOverride
          ? [
              {
                layer: 'LOCAL_OVERRIDE' as const,
                value: null,
                sourceLabel: store.name,
                sourceId: store.id,
              },
            ]
          : []),
      ],
    });

    return {
      category: meta.key,
      label: meta.label,
      mode,
      isDefaultPolicy: isDefault,
      automation: meta.automation,
      channelVariable: meta.channelVariable,
      provenance: resolved.provenance,
      origin: resolved.origin,
      isOverridden: resolved.isOverridden,
      isSourceStale: resolved.isSourceStale,
      isUnsupported: resolved.isUnsupported,
      note: meta.note,
      apiSurface: meta.apiSurface,
    };
  });

  // Per-tab data, loaded only for the active tab.
  const tabData = await loadTabData(activeTab, store.id, scope.organisationId);
  const dataSource = store.isDemo ? ('DEMO' as const) : ('LIVE' as const);

  const counts: Record<string, number> = {
    storefronts: store.channels.length,
    catalog: store._count.products,
    orders: store._count.orders,
    customers: store._count.customers,
    capabilities: store.capabilities.filter((capability) => capability.status !== 'AVAILABLE').length,
    credentials: store.credentials.filter((credential) => credential.status === 'ACTIVE').length,
    configuration: store.overrides.length + store.manualActions.length,
  };

  return (
    <>
      <PageHeader
        title={store.name}
        breadcrumbs={[
          { label: 'Estate' },
          { label: 'Stores', href: '/stores' },
          { label: store.name },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden>{countryFlag(store.countryCode)}</span>
            {store.company.name}
            {store.region ? <>· {store.region.name}</> : null}
            {store.primaryDomain ? (
              <>
                ·
                <a
                  href={`https://${store.primaryDomain}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {store.primaryDomain}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            ) : null}
          </span>
        }
        meta={
          <>
            <HealthBadge status={store.healthStatus} />
            <DataSourceBadge
              source={dataSource}
              reason={
                store.isDemo
                  ? 'This store is a demo connection. Everything shown is seeded data; no BigCommerce store is contacted.'
                  : 'Read live from the BigCommerce API using the stored credential.'
              }
            />
          </>
        }
        actions={
          <>
            {store.controlPanelUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={store.controlPanelUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Control panel
                </a>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/conflicts?store=${store.id}`}>
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                Compare
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/sync?action=full&targets=${store.id}`}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Sync store
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/deployments/new?targets=${store.id}`}>
                <Rocket className="h-4 w-4" aria-hidden />
                New deployment
              </Link>
            </Button>
          </>
        }
      />

      <StoreTabs activeTab={activeTab} counts={counts} />

      {activeTab === 'summary' ? (
        <SummaryPanel store={store} metrics={{ ...metrics }} effectiveModes={effectiveModes} />
      ) : null}
      {activeTab === 'configuration' ? (
        <ConfigurationPanel store={store} rows={configurationRows} />
      ) : null}
      {activeTab === 'storefronts' ? <StorefrontsPanel store={store} /> : null}
      {activeTab === 'credentials' ? <CredentialsPanel store={store} /> : null}
      {activeTab === 'capabilities' ? <CapabilitiesPanel store={store} /> : null}
      {activeTab === 'theme' ? <ThemePanel store={store} /> : null}
      {activeTab === 'sync' ? <SyncHistoryPanel jobs={tabData.jobs ?? []} /> : null}
      {activeTab === 'audit' ? <AuditHistoryPanel events={tabData.audit ?? []} /> : null}
      {activeTab === 'content' ? (
        <ContentPanel content={tabData.content ?? []} source={dataSource} />
      ) : null}

      {activeTab === 'catalog' ? (
        <CatalogTab products={tabData.products ?? []} currency={store.currencyCode} source={dataSource} storeId={store.id} />
      ) : null}
      {activeTab === 'pricing' ? (
        <PricingTab entries={tabData.pricing ?? []} source={dataSource} />
      ) : null}
      {activeTab === 'inventory' ? <InventoryTab records={tabData.inventory ?? []} source={dataSource} /> : null}
      {activeTab === 'orders' ? <OrdersTab orders={tabData.orders ?? []} storeId={store.id} /> : null}
      {activeTab === 'customers' ? (
        <CustomersTab customers={tabData.customers ?? []} storeId={store.id} />
      ) : null}
      {activeTab === 'analytics' ? (
        <AnalyticsTab
          store={store}
          metrics={metrics}
          conflicts={tabData.conflicts ?? []}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

async function loadTabData(tab: StoreTabId, connectionId: string, organisationId: string) {
  switch (tab) {
    case 'catalog':
      return {
        products: await prisma.productSnapshot.findMany({
          where: { connectionId },
          orderBy: { sku: 'asc' },
          take: 200,
        }),
      };
    case 'pricing':
      return {
        pricing: await prisma.pricingEntry.findMany({
          where: { connectionId },
          orderBy: { sku: 'asc' },
          take: 200,
        }),
      };
    case 'inventory':
      return {
        inventory: await prisma.inventoryRecord.findMany({
          where: { connectionId },
          orderBy: [{ status: 'asc' }, { quantity: 'asc' }],
          take: 200,
        }),
      };
    case 'orders':
      return {
        orders: await prisma.orderSnapshot.findMany({
          where: { connectionId },
          orderBy: { placedAt: 'desc' },
          take: 50,
        }),
      };
    case 'customers':
      return {
        customers: await prisma.customerSnapshot.findMany({
          where: { connectionId },
          orderBy: { lastOrderAt: 'desc' },
          take: 50,
        }),
      };
    case 'content':
      return {
        content: await prisma.contentSnapshot.findMany({
          where: { connectionId },
          orderBy: [{ contentType: 'asc' }, { title: 'asc' }],
        }),
      };
    case 'sync':
      return {
        jobs: await prisma.syncJob.findMany({
          where: { organisationId, targets: { some: { connectionId } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      };
    case 'audit':
      return {
        audit: await prisma.auditEvent.findMany({
          where: { organisationId, connectionId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      };
    case 'analytics':
      return {
        conflicts: await prisma.conflict.findMany({
          where: {
            organisationId,
            targetConnectionId: connectionId,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
          orderBy: { detectedAt: 'desc' },
          take: 30,
        }),
      };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Inline tab bodies that are simple enough not to warrant their own module
// ---------------------------------------------------------------------------

function CatalogTab({
  products,
  currency,
  source,
  storeId,
}: {
  products: {
    id: string;
    sku: string;
    name: string;
    brandName: string | null;
    price: string;
    salePrice: string | null;
    isVisible: boolean;
    inventoryLevel: number | null;
    externalModifiedAt: Date | null;
  }[];
  currency: string;
  source: 'DEMO' | 'LIVE';
  storeId: string;
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        title="No catalog snapshot"
        description="Run a catalog pull to capture this store's products."
        action={{ label: 'Pull the catalog', href: `/sync?action=catalog&targets=${storeId}` }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <DataSourceBadge source={source} />
        <span className="text-sm text-muted-foreground">
          {formatNumber(products.length)} product snapshot{products.length === 1 ? '' : 's'}
        </span>
        <Button variant="outline" size="sm" asChild className="ml-auto">
          <Link href={`/catalog?store=${storeId}`}>Open in the catalog workspace</Link>
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Modified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Link href={`/catalog/${encodeURIComponent(product.sku)}`} className="font-medium hover:underline">
                    {product.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{product.brandName ?? '—'}</TableCell>
                <TableCell className="tabular text-right">
                  {formatMoneyString(product.price, currency)}
                  {product.salePrice ? (
                    <p className="text-xs text-success">Sale {formatMoneyString(product.salePrice, currency)}</p>
                  ) : null}
                </TableCell>
                <TableCell className="tabular text-right">
                  {product.inventoryLevel === null ? '—' : formatNumber(product.inventoryLevel)}
                </TableCell>
                <TableCell>
                  <Badge variant={product.isVisible ? 'success' : 'muted'} size="sm">
                    {product.isVisible ? 'Visible' : 'Hidden'}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelativeTime(product.externalModifiedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PricingTab({
  entries,
  source,
}: {
  entries: {
    id: string;
    sku: string;
    currencyCode: string;
    basePrice: string;
    salePrice: string | null;
    retailPrice: string | null;
    costPrice: string | null;
    origin: string;
    isOverride: boolean;
    priceListName: string | null;
  }[];
  source: 'DEMO' | 'LIVE';
}) {
  if (entries.length === 0) {
    return <EmptyState title="No pricing captured" description="Run a catalog pull to capture pricing." />;
  }

  return (
    <div className="space-y-3">
      <DataSourceBadge source={source} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Sale</TableHead>
              <TableHead className="text-right">Retail</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Origin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <code className="font-mono text-xs">{entry.sku}</code>
                </TableCell>
                <TableCell className="tabular text-right font-medium">
                  {formatMoneyString(entry.basePrice, entry.currencyCode)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {entry.salePrice ? formatMoneyString(entry.salePrice, entry.currencyCode) : '—'}
                </TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {entry.retailPrice ? formatMoneyString(entry.retailPrice, entry.currencyCode) : '—'}
                </TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {entry.costPrice ? formatMoneyString(entry.costPrice, entry.currencyCode) : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={entry.isOverride ? 'warning' : 'muted'} size="sm">
                    {titleCase(entry.origin)}
                  </Badge>
                  {entry.priceListName ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{entry.priceListName}</p>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function InventoryTab({
  records,
  source,
}: {
  records: {
    id: string;
    sku: string;
    productName: string | null;
    quantity: number;
    safetyStock: number;
    buffer: number;
    lowStockThreshold: number;
    status: string;
    strategy: string;
    dataSource: string;
    locationName: string | null;
    externalUpdatedAt: Date | null;
  }[];
  source: 'DEMO' | 'LIVE';
}) {
  if (records.length === 0) {
    return <EmptyState title="No inventory captured" description="Run an inventory sync to capture stock levels." />;
  }

  const strategy = records[0]?.strategy ?? 'INDEPENDENT';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DataSourceBadge source={source} />
        <Badge variant="secondary">{titleCase(strategy)}</Badge>
        <span className="text-sm text-muted-foreground">
          Stock is store-local. Independent stores never share physical inventory.
        </span>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Safety</TableHead>
              <TableHead className="text-right">Buffer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <p className="font-medium">{record.productName ?? record.sku}</p>
                  <p className="font-mono text-xs text-muted-foreground">{record.sku}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{record.locationName ?? '—'}</TableCell>
                <TableCell className="tabular text-right font-medium">{formatNumber(record.quantity)}</TableCell>
                <TableCell className="tabular text-right text-muted-foreground">{record.safetyStock}</TableCell>
                <TableCell className="tabular text-right text-muted-foreground">{record.buffer}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      record.status === 'OUT_OF_STOCK'
                        ? 'destructive'
                        : record.status === 'LOW'
                          ? 'warning'
                          : 'success'
                    }
                    size="sm"
                  >
                    {titleCase(record.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{record.dataSource}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function OrdersTab({
  orders,
  storeId,
}: {
  orders: {
    id: string;
    orderNumber: string;
    statusLabel: string;
    statusCategory: string;
    currencyCode: string;
    grandTotal: string;
    itemCount: number;
    customerName: string | null;
    placedAt: Date;
  }[];
  storeId: string;
}) {
  if (orders.length === 0) {
    return <EmptyState title="No orders" description="This store has no captured orders." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Showing the {orders.length} most recent orders.</span>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/orders?store=${storeId}`}>Open in the order workspace</Link>
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                    {order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{order.customerName ?? 'Guest'}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      order.statusCategory === 'FULFILLED'
                        ? 'success'
                        : order.statusCategory === 'CANCELLED' || order.statusCategory === 'REFUNDED'
                          ? 'muted'
                          : 'info'
                    }
                    size="sm"
                  >
                    {order.statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="tabular text-right">{order.itemCount}</TableCell>
                <TableCell className="tabular text-right font-medium">
                  {formatMoneyString(order.grandTotal, order.currencyCode)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(order.placedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function CustomersTab({
  customers,
  storeId,
}: {
  customers: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailMasked: string;
    company: string | null;
    customerGroupName: string | null;
    orderCount: number;
    lifetimeValue: string;
    currencyCode: string;
    lastOrderAt: Date | null;
  }[];
  storeId: string;
}) {
  if (customers.length === 0) {
    return <EmptyState title="No customers" description="This store has no captured customers." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Personal data is masked. Full details are fetched on demand and never stored.
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/customers?store=${storeId}`}>Open in the customer workspace</Link>
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Lifetime value</TableHead>
              <TableHead>Last order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                    {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                  </Link>
                  <p className="text-xs text-muted-foreground">{customer.emailMasked}</p>
                  {customer.company ? (
                    <p className="text-xs text-muted-foreground">{customer.company}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {customer.customerGroupName ? (
                    <Badge variant="secondary" size="sm">
                      {customer.customerGroupName}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="tabular text-right">{customer.orderCount}</TableCell>
                <TableCell className="tabular text-right font-medium">
                  {formatMoneyString(customer.lifetimeValue, customer.currencyCode)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelativeTime(customer.lastOrderAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AnalyticsTab({
  store,
  metrics,
  conflicts,
}: {
  store: { name: string; currencyCode: string; _count: { products: number; orders: number; customers: number } };
  metrics: { revenue: string; orders: number; aov: string; currencyCode: string; conversionRate: number | null; refundRate: number | null };
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
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue (30d)</p>
            <p className="tabular mt-1 text-2xl font-semibold">
              {formatMoneyString(metrics.revenue, metrics.currencyCode, { compact: true })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Orders (30d)</p>
            <p className="tabular mt-1 text-2xl font-semibold">{formatNumber(metrics.orders)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Average order value</p>
            <p className="tabular mt-1 text-2xl font-semibold">
              {formatMoneyString(metrics.aov, metrics.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Catalog size</p>
            <p className="tabular mt-1 text-2xl font-semibold">{formatNumber(store._count.products)}</p>
          </CardContent>
        </Card>
      </div>

      <ConflictsPanel conflicts={conflicts} storeName={store.name} />
    </div>
  );
}
