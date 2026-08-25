import Link from 'next/link';
import type { Metadata } from 'next';
import { GitCompareArrows, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { loadCatalogMatrix } from '@/server/services/catalog';
import { loadShellData } from '@/server/services/scope';
import { formatNumber, formatPercent } from '@/lib/utils';
import { ProductMatrix } from './product-matrix';

export const metadata: Metadata = { title: 'Catalog' };
export const dynamic = 'force-dynamic';

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/catalog');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  const [shell, matrix] = await Promise.all([
    loadShellData(scope),
    loadCatalogMatrix(scope, {
      storeIds: params.store ? [params.store] : undefined,
      limit: 400,
    }),
  ]);

  const consistency =
    matrix.totals.skus > 0 ? (matrix.totals.consistent / matrix.totals.skus) * 100 : null;

  return (
    <>
      <PageHeader
        title="Catalog"
        breadcrumbs={[{ label: 'Commerce' }, { label: 'Catalog' }]}
        description={
          matrix.masterStoreName
            ? `Every product across ${formatNumber(matrix.stores.length)} store(s), compared against ${matrix.masterStoreName}.`
            : 'Every product across the stores in scope. No master store is configured, so nothing is being compared.'
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/sync?action=catalog">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Pull catalog
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/conflicts?category=PRODUCTS">
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                Open conflicts
              </Link>
            </Button>
          </>
        }
      />

      {matrix.rows.length === 0 ? (
        <EmptyState
          title="No catalog snapshots yet"
          description="Run a catalog pull against the stores in scope to build the comparison matrix."
          action={{ label: 'Pull the catalog', href: '/sync?action=catalog' }}
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Distinct SKUs"
              value={formatNumber(matrix.totals.skus)}
              hint={`across ${formatNumber(matrix.stores.length)} stores`}
              tooltip="Products are matched by SKU, the only identifier that is portable between independent BigCommerce stores."
            />
            <MetricCard
              label="Consistent"
              value={formatNumber(matrix.totals.consistent)}
              tone="success"
              hint={consistency !== null ? formatPercent(consistency) : undefined}
            />
            <MetricCard
              label="Local overrides"
              value={formatNumber(matrix.totals.overridden)}
              tooltip="A deliberate local value is recorded, so the difference is explained rather than drift."
            />
            <MetricCard
              label="Diverging"
              value={formatNumber(matrix.totals.diverging)}
              tone={matrix.totals.diverging > 0 ? 'warning' : 'default'}
              tooltip="Differs from the master with no override to explain it."
            />
            <MetricCard
              label="Missing somewhere"
              value={formatNumber(matrix.totals.missing)}
              tone={matrix.totals.missing > 0 ? 'warning' : 'default'}
              tooltip="Present in the master but absent from at least one store in scope."
            />
          </div>

          <InfoNote className="mb-4">
            Product records are shared by every storefront channel inside a Multi-Storefront store — a channel
            controls which products are <em>listed</em>, not their underlying fields. Across independent stores
            nothing is shared at all, which is why this matrix exists.
            {shell.active.storeName ? (
              <>
                {' '}
                Currently scoped to <span className="font-medium">{shell.active.storeName}</span>.
              </>
            ) : null}
          </InfoNote>

          <ProductMatrix matrix={matrix} />
        </>
      )}
    </>
  );
}
