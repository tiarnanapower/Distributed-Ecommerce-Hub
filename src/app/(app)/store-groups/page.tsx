import Link from 'next/link';
import type { Metadata } from 'next';
import { Layers } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { countryFlag, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Store groups' };
export const dynamic = 'force-dynamic';

export default async function StoreGroupsPage() {
  const auth = await requireAuthOrRedirect('/store-groups');
  const scope = scopeFromAuth(auth);

  const groups = await prisma.storeGroup.findMany({
    where: { organisationId: scope.organisationId, deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      company: { select: { name: true } },
      members: {
        include: {
          connection: {
            select: { id: true, name: true, countryCode: true, currencyCode: true, healthStatus: true },
          },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Store groups"
        breadcrumbs={[{ label: 'Estate' }, { label: 'Store Groups' }]}
        description="Arbitrary groupings used to target deployments and comparisons. They exist only inside this platform."
      />

      <InfoNote className="mb-6">
        <span className="font-medium">A store group is not a BigCommerce object.</span> It has no store hash, no
        credentials and no storefront. It is simply a named set of stores, so that &ldquo;deploy to the peak-season
        wave&rdquo; means something concrete.
      </InfoNote>

      {groups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No store groups"
          description="Create a group to target several stores at once."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: group.colorHex }}
                        aria-hidden
                      />
                      <Link href={`/store-groups/${group.id}`} className="hover:underline">
                        {group.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="mt-1">{group.description}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" size="sm">
                      {titleCase(group.purpose)}
                    </Badge>
                    <Badge variant="muted" size="sm">
                      {group.members.length} store{group.members.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">
                  {group.company ? `Scoped to ${group.company.name}` : 'Organisation-wide'}
                </p>
                <ul className="space-y-1">
                  {group.members.map((member) => (
                    <li key={member.id}>
                      <Link
                        href={`/stores/${member.connectionId}`}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm transition-colors hover:bg-muted"
                      >
                        <HealthDot status={member.connection.healthStatus} />
                        <span aria-hidden>{countryFlag(member.connection.countryCode)}</span>
                        <span className="min-w-0 flex-1 truncate">{member.connection.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {member.connection.currencyCode}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link
                      href={`/deployments/new?targets=${group.members.map((m) => m.connectionId).join(',')}`}
                    >
                      Deploy to this group
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link href={`/conflicts?stores=${group.members.map((m) => m.connectionId).join(',')}`}>
                      Compare
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
