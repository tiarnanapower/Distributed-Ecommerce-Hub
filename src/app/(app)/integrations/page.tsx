import type { Metadata } from 'next';
import { ExternalLink, Plug } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { CONNECTOR_STATUS_LABELS, type ConnectorStatus } from '@/lib/enums';
import { formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<ConnectorStatus, 'success' | 'info' | 'muted' | 'warning'> = {
  AVAILABLE_FOR_CONFIGURATION: 'success',
  COMING_SOON: 'info',
  DISPLAY_ONLY: 'muted',
  PARTNER_MANAGED: 'warning',
};

export default async function IntegrationsPage() {
  await requireAuthOrRedirect('/integrations');

  const connectors = await prisma.connectorDefinition.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const byCategory = new Map<string, typeof connectors>();
  for (const connector of connectors) {
    byCategory.set(connector.category, [...(byCategory.get(connector.category) ?? []), connector]);
  }

  const categories = [...byCategory.keys()].sort();

  return (
    <>
      <PageHeader
        title="Integrations"
        breadcrumbs={[{ label: 'Operations' }, { label: 'Integrations' }]}
        description={`${formatNumber(connectors.length)} connectors across ${formatNumber(categories.length)} categories, with an honest note on how each one interacts with a multi-store estate.`}
      />

      <InfoNote className="mb-6">
        <span className="font-medium">This directory is display-only in this release.</span> No connector
        performs authentication, stores a credential or makes an outbound request. Each card explains what the
        integration would mean for a multi-store estate — particularly where it would become the source of truth
        and this platform should step back to read-only.
      </InfoNote>

      {connectors.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No connectors"
          description="The connector catalogue has not been seeded. Run `npm run db:seed`."
        />
      ) : (
        categories.map((category) => (
          <Section key={category} title={category}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(byCategory.get(category) ?? []).map((connector) => (
                <Card key={connector.id} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col p-5">
                    <div className="flex items-start gap-3">
                      {/* Logos load from a public icon CDN in local development only. */}
                      <img
                        src={`https://cdn.simpleicons.org/${connector.logoSlug}/${connector.logoColor}`}
                        alt=""
                        width={28}
                        height={28}
                        className="mt-0.5 h-7 w-7 shrink-0 rounded"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{connector.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{connector.vendor}</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed">{connector.shortDescription}</p>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {connector.longDescription}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <Badge variant={STATUS_VARIANT[connector.status as ConnectorStatus] ?? 'muted'} size="sm">
                        {CONNECTOR_STATUS_LABELS[connector.status as ConnectorStatus] ?? connector.status}
                      </Badge>
                      <Badge variant="outline" size="sm">
                        {connector.integrationType}
                      </Badge>
                      {connector.supportsMultiStore ? (
                        <Badge variant="secondary" size="sm">
                          Multi-store aware
                        </Badge>
                      ) : (
                        <Badge variant="muted" size="sm">
                          Per store
                        </Badge>
                      )}
                    </div>

                    {connector.docsUrl ? (
                      <a
                        href={connector.docsUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Vendor documentation
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>
        ))
      )}

      <Card className="mt-4">
        <CardContent className="p-5">
          <p className="text-sm font-semibold">Why display-only matters here</p>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            An integration that owns a resource must not be fought over. Where an ERP owns inventory or a tax
            provider owns rates, the honest behaviour for this platform is to switch that resource to read-only
            for the affected stores rather than offering a write that would be overwritten minutes later. That
            coordination is a real design decision, not a checkbox, which is why connectors are documented before
            they are wired up.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
