import type { Metadata } from 'next';

import { PageHeader } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { DeploymentBuilder } from './deployment-builder';

export const metadata: Metadata = { title: 'New deployment' };
export const dynamic = 'force-dynamic';

export default async function NewDeploymentPage({
  searchParams,
}: {
  searchParams: Promise<{ targets?: string; category?: string; skus?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/deployments/new');
  const scope = scopeFromAuth(auth);
  const params = await searchParams;

  const stores = await prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      currencyCode: true,
      countryCode: true,
      healthStatus: true,
      hierarchyMode: true,
      isDemo: true,
    },
  });

  return (
    <>
      <PageHeader
        title="New deployment"
        breadcrumbs={[
          { label: 'Operations' },
          { label: 'Deployments', href: '/deployments' },
          { label: 'New' },
        ]}
        description="Every cross-store change starts as a dry-run. Nothing is written until the plan has been reviewed and confirmed."
      />

      <InfoNote className="mb-6">
        The workflow is: draft → select source → select targets → calculate differences → check capabilities →
        validate → review warnings → dry-run → approve if required → confirm → execute in batches → record
        results. You are at the start of it.
      </InfoNote>

      <DeploymentBuilder
        stores={stores}
        initialTargets={params.targets ? params.targets.split(',') : []}
        initialCategory={params.category}
        initialSkus={params.skus ? params.skus.split(',').map(decodeURIComponent) : []}
      />
    </>
  );
}
