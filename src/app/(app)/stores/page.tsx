import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import { loadStoreDirectory } from '@/server/services/stores';
import { loadShellData } from '@/server/services/scope';
import { formatNumber } from '@/lib/utils';
import { StoreDirectory } from './store-directory';

export const metadata: Metadata = { title: 'Stores' };
export const dynamic = 'force-dynamic';

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string; view?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/stores');
  const scope = scopeFromAuth(auth);
  const [shell, stores, savedViews] = await Promise.all([
    loadShellData(scope),
    loadStoreDirectory(scope),
    prisma.savedView.findMany({
      where: {
        organisationId: scope.organisationId,
        entity: 'stores',
        OR: [{ userId: scope.userId }, { isShared: true }],
      },
      orderBy: { name: 'asc' },
    }),
  ]);
  const params = await searchParams;

  const totals = {
    total: stores.length,
    healthy: stores.filter((store) => store.healthStatus === 'HEALTHY').length,
    attention: stores.filter((store) => ['WARNING', 'CRITICAL'].includes(store.healthStatus)).length,
    channels: stores.reduce((sum, store) => sum + store.channelCount, 0),
    msf: stores.filter((store) => store.msfEnabled).length,
    conflicts: stores.reduce((sum, store) => sum + store.openConflicts, 0),
  };

  return (
    <>
      <PageHeader
        title="Store directory"
        description={`${shell.active.companyName ?? 'All companies'} · every BigCommerce store and storefront this organisation manages.`}
        breadcrumbs={[{ label: 'Estate' }, { label: 'Stores' }]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/sync?action=full">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Sync all stores
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/stores/new">
                <Plus className="h-4 w-4" aria-hidden />
                Add store
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Connected stores"
          value={formatNumber(totals.total)}
          hint={`${formatNumber(totals.msf)} with Multi-Storefront`}
          tooltip="Each row is one BigCommerce store, identified by its own store hash and credentials."
        />
        <MetricCard
          label="Healthy"
          value={formatNumber(totals.healthy)}
          tone={totals.healthy === totals.total ? 'success' : 'default'}
        />
        <MetricCard
          label="Needing attention"
          value={formatNumber(totals.attention)}
          tone={totals.attention > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Storefront channels"
          value={formatNumber(totals.channels)}
          hint="Channels live inside a store and share its catalog"
          tooltip="A storefront channel is not a separate BigCommerce store — it belongs to a Multi-Storefront store and shares its credentials and product data."
        />
      </div>

      <InfoNote className="mb-6">
        <span className="font-medium">Three different things appear here.</span> An{' '}
        <span className="font-medium">independent store</span> has its own store hash and credentials. A{' '}
        <span className="font-medium">storefront channel</span> lives inside a Multi-Storefront store and shares
        its catalog. A <span className="font-medium">store group</span> exists only in this platform and has no
        BigCommerce counterpart.
      </InfoNote>

      <StoreDirectory
        stores={stores}
        savedViews={savedViews.map((view) => ({
          id: view.id,
          name: view.name,
          filters: parseJsonLoose<Record<string, string[]>>(view.filtersJson, {}),
          isShared: view.isShared,
        }))}
        initialHealthFilter={params.health}
        initialView={params.view}
      />
    </>
  );
}
