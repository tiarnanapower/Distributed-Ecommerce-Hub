import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatRow } from '@/components/shared/metric-card';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { product } from '@/lib/config';
import { formatDate, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Organisation profile' };
export const dynamic = 'force-dynamic';

export default async function OrganisationSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings');
  const scope = scopeFromAuth(auth);

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: scope.organisationId },
    include: {
      _count: {
        select: { companies: true, connections: true, channels: true, brands: true, memberships: true },
      },
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{organisation.name}</CardTitle>
          <CardDescription>{organisation.legalName}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="divide-y">
              <StatRow label="Slug" value={<code className="font-mono text-xs">{organisation.slug}</code>} />
              <StatRow
                label="Reporting currency"
                value={organisation.reportingCurrency}
                tooltip="Used only where a multi-currency total is explicitly converted. Per-store figures always stay in the store's own currency."
              />
              <StatRow label="Default locale" value={organisation.defaultLocale} />
              <StatRow label="Timezone" value={organisation.timezone} />
              <StatRow label="Plan tier" value={organisation.planTier} />
            </div>
            <div className="divide-y">
              <StatRow label="Companies" value={formatNumber(organisation._count.companies)} />
              <StatRow label="Store connections" value={formatNumber(organisation._count.connections)} />
              <StatRow label="Storefront channels" value={formatNumber(organisation._count.channels)} />
              <StatRow label="Brands" value={formatNumber(organisation._count.brands)} />
              <StatRow label="Members" value={formatNumber(organisation._count.memberships)} />
              <StatRow label="Created" value={formatDate(organisation.createdAt)} />
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Product configuration</CardTitle>
          <CardDescription>
            The product name and branding live in one file so they can be changed in a single place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <StatRow label="Product name" value={product.name} />
            <StatRow label="Short name" value={product.shortName} />
            <StatRow label="Version" value={product.version} />
            <StatRow
              label="Configuration file"
              value={<code className="font-mono text-xs">src/lib/config.ts</code>}
            />
          </dl>
        </CardContent>
      </Card>

      <InfoNote>
        Editing organisation profile fields is not wired up in this release. The data model supports it and the
        audit trail is in place; the forms are the remaining piece.
      </InfoNote>
    </div>
  );
}
