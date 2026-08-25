import Link from 'next/link';
import type { Metadata } from 'next';
import { Building2, Layers, MapPin, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatMoneyString } from '@/lib/money';
import { storeMetrics } from '@/server/services/connections';
import { countryFlag, formatNumber, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Companies' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const auth = await requireAuthOrRedirect('/companies');
  const scope = scopeFromAuth(auth);

  const [organisation, companies, brands, environments] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: scope.organisationId } }),
    prisma.company.findMany({
      where: {
        organisationId: scope.organisationId,
        deletedAt: null,
        ...(scope.allowedCompanyIds.length > 0 ? { id: { in: scope.allowedCompanyIds } } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        regions: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: { _count: { select: { connections: true } } },
        },
        connections: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            countryCode: true,
            currencyCode: true,
            healthStatus: true,
            hierarchyMode: true,
            regionId: true,
            metricsJson: true,
          },
        },
      },
    }),
    prisma.brand.findMany({
      where: { organisationId: scope.organisationId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { connections: true } } },
    }),
    prisma.environment.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { connections: true } } },
    }),
  ]);

  const totalStores = companies.reduce((sum, company) => sum + company.connections.length, 0);
  const totalRegions = companies.reduce((sum, company) => sum + company.regions.length, 0);

  return (
    <>
      <PageHeader
        title="Companies"
        breadcrumbs={[{ label: 'Estate' }, { label: 'Companies' }]}
        description={`${organisation.name} · the organisational hierarchy this platform overlays on your BigCommerce estate.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Companies" value={formatNumber(companies.length)} />
        <MetricCard label="Regions" value={formatNumber(totalRegions)} />
        <MetricCard label="Brands" value={formatNumber(brands.length)} />
        <MetricCard label="Stores" value={formatNumber(totalStores)} />
      </div>

      <InfoNote className="mb-6">
        Companies, regions, brands and environments exist only inside this platform. BigCommerce has no
        equivalent — they are how you organise an estate of otherwise unrelated stores.
      </InfoNote>

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies"
          description="Create a company to start organising stores."
        />
      ) : (
        <div className="space-y-6">
          {companies.map((company) => {
            const unassigned = company.connections.filter((connection) => !connection.regionId);
            return (
              <Card key={company.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: company.accentColor }}
                          aria-hidden
                        />
                        {company.name}
                        <Badge variant="muted" size="sm">
                          {company.code}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1 max-w-3xl">{company.description}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" size="sm">
                        {titleCase(company.businessModel)}
                      </Badge>
                      <Badge variant="muted" size="sm">
                        Reports in {company.reportingCurrency}
                      </Badge>
                      {company.headquarters ? (
                        <Badge variant="outline" size="sm">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {company.headquarters}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {company.regions.map((region) => {
                      const stores = company.connections.filter(
                        (connection) => connection.regionId === region.id,
                      );
                      return (
                        <div key={region.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{region.name}</p>
                            <Badge variant="muted" size="sm">
                              {region.code}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {region.countriesCsv.split(',').filter(Boolean).map((code) => countryFlag(code)).join(' ')}{' '}
                            · {region.defaultCurrency} · {region.timezone}
                          </p>

                          {stores.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">No stores in this region.</p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {stores.map((store) => {
                                const metrics = storeMetrics(store.metricsJson);
                                return (
                                  <li key={store.id}>
                                    <Link
                                      href={`/stores/${store.id}`}
                                      className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm transition-colors hover:bg-muted"
                                    >
                                      <HealthDot status={store.healthStatus} />
                                      <span aria-hidden>{countryFlag(store.countryCode)}</span>
                                      <span className="min-w-0 flex-1 truncate">{store.name}</span>
                                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                                        {formatMoneyString(metrics.revenue, metrics.currencyCode, {
                                          compact: true,
                                        })}
                                      </span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}

                    {unassigned.length > 0 ? (
                      <div className="rounded-lg border border-dashed p-3">
                        <p className="text-sm font-medium text-muted-foreground">No region assigned</p>
                        <ul className="mt-2 space-y-1">
                          {unassigned.map((store) => (
                            <li key={store.id}>
                              <Link
                                href={`/stores/${store.id}`}
                                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm transition-colors hover:bg-muted"
                              >
                                <HealthDot status={store.healthStatus} />
                                <span className="truncate">{store.name}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Section title="Brands and environments" className="mt-8">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Tag className="h-4 w-4" aria-hidden />
                Brands
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {brands.map((brand) => (
                <div key={brand.id} className="flex items-start gap-3 rounded-md border p-3">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: brand.colorHex }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{brand.name}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{brand.description}</p>
                  </div>
                  <Badge variant="muted" size="sm">
                    {brand._count.connections} store{brand._count.connections === 1 ? '' : 's'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Layers className="h-4 w-4" aria-hidden />
                Environments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {environments.map((environment) => (
                <div key={environment.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{environment.name}</p>
                    <div className="flex gap-1.5">
                      <Badge variant={environment.isProduction ? 'default' : 'warning'} size="sm">
                        {environment.isProduction ? 'Production' : 'Non-production'}
                      </Badge>
                      <Badge variant="muted" size="sm">
                        {environment._count.connections}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {environment.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Guard rails: <span className="font-medium">{titleCase(environment.guardrailLevel)}</span>
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Section>
    </>
  );
}
