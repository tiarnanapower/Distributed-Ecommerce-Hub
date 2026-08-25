import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { ConflictTypeBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { loadProductDetail } from '@/server/services/catalog';
import { parseJsonLoose } from '@/lib/json';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatNumber, formatRelativeTime, titleCase, truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  return { title: decodeURIComponent(sku) };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);
  const auth = await requireAuthOrRedirect(`/catalog/${rawSku}`);
  const scope = scopeFromAuth(auth);

  const { snapshots, overrides, mappings, conflicts } = await loadProductDetail(scope, sku);

  if (snapshots.length === 0) notFound();

  const reference = snapshots[0]!;
  const masterSnapshot =
    snapshots.find((snapshot) => snapshot.connection.hierarchyMode === 'MASTER') ?? reference;
  const categories = parseJsonLoose<{ name: string }[]>(reference.categoriesJson, []);
  const customFields = parseJsonLoose<{ name: string; value: string }[]>(reference.customFieldsJson, []);

  return (
    <>
      <PageHeader
        title={reference.name}
        breadcrumbs={[
          { label: 'Commerce' },
          { label: 'Catalog', href: '/catalog' },
          { label: sku },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <code className="font-mono text-xs">{sku}</code>
            {reference.brandName ? <>· {reference.brandName}</> : null}
            {categories.length > 0 ? <>· {categories.map((c) => c.name).join(' / ')}</> : null}
          </span>
        }
        meta={
          <Badge variant="secondary">
            In {formatNumber(snapshots.length)} store{snapshots.length === 1 ? '' : 's'}
          </Badge>
        }
      />

      <InfoNote className="mb-6">
        This SKU maps to a <span className="font-medium">different numeric product id in every store</span>. The
        ids below are store-local; cross-store operations resolve identity through the mapping table, never by
        assuming ids match.
      </InfoNote>

      <Section title="Per-store values">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Local product id</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Sale</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((snapshot) => {
                const isMaster = snapshot.connection.hierarchyMode === 'MASTER';
                const sameCurrency = snapshot.currencyCode === masterSnapshot.currencyCode;
                const priceDiffers =
                  !isMaster && sameCurrency && Number(snapshot.price) !== Number(masterSnapshot.price);

                return (
                  <TableRow key={snapshot.id}>
                    <TableCell>
                      <Link
                        href={`/stores/${snapshot.connection.id}`}
                        className="flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <HealthDot status={snapshot.connection.healthStatus} />
                        <span aria-hidden>{countryFlag(snapshot.connection.countryCode)}</span>
                        {snapshot.connection.name}
                        {isMaster ? (
                          <Badge variant="warning" size="sm">
                            Master
                          </Badge>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs text-muted-foreground">
                        {snapshot.externalProductId}
                      </code>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      <span className={priceDiffers ? 'font-medium text-warning' : 'font-medium'}>
                        {formatMoneyString(snapshot.price, snapshot.currencyCode)}
                      </span>
                      {priceDiffers ? (
                        <p className="text-xs text-muted-foreground">
                          master {formatMoneyString(masterSnapshot.price, masterSnapshot.currencyCode)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {snapshot.salePrice
                        ? formatMoneyString(snapshot.salePrice, snapshot.currencyCode)
                        : '—'}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {snapshot.costPrice
                        ? formatMoneyString(snapshot.costPrice, snapshot.currencyCode)
                        : '—'}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {snapshot.inventoryLevel === null ? '—' : formatNumber(snapshot.inventoryLevel)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={snapshot.isVisible ? 'success' : 'muted'} size="sm">
                        {snapshot.isVisible ? 'Visible' : 'Hidden'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(snapshot.externalModifiedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Local overrides">
          {overrides.length === 0 ? (
            <EmptyState
              title="No overrides"
              description="No store has recorded a deliberate local value for this product."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrides.map((override) => (
                    <TableRow key={override.id}>
                      <TableCell className="font-medium">{override.connection.name}</TableCell>
                      <TableCell>
                        <code className="font-mono text-xs">
                          {truncate(JSON.stringify(parseJsonLoose(override.valueJson, {})), 34)}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {override.reason ?? '—'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRelativeTime(override.setAt)}
                          {override.setBy ? ` by ${override.setBy.name}` : ''}
                        </p>
                        {override.sourceChangedAt ? (
                          <Badge variant="warning" size="sm" className="mt-1">
                            Master changed since
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Section>

        <Section title="Cross-store mapping">
          {mappings.length === 0 ? (
            <EmptyState
              title="No mappings"
              description="Run a comparison scan to build the master-to-target product mapping."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target store</TableHead>
                    <TableHead>Master id</TableHead>
                    <TableHead>Target id</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell className="font-medium">{mapping.target.name}</TableCell>
                      <TableCell>
                        <code className="font-mono text-xs">{mapping.masterProductId}</code>
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-xs">{mapping.targetProductId ?? '—'}</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            mapping.mappingStatus === 'MAPPED'
                              ? 'success'
                              : mapping.mappingStatus === 'MISSING_IN_TARGET'
                                ? 'warning'
                                : 'muted'
                          }
                          size="sm"
                        >
                          {titleCase(mapping.mappingStatus)}
                        </Badge>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          via {titleCase(mapping.matchStrategy)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Section>
      </div>

      {conflicts.length > 0 ? (
        <Section title={`Open differences (${conflicts.length})`}>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts.map((conflict) => (
                  <TableRow key={conflict.id}>
                    <TableCell>
                      <Link href={`/conflicts/${conflict.id}`} className="font-medium hover:underline">
                        {conflict.target.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ConflictTypeBadge type={conflict.conflictType} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          conflict.status === 'OPEN'
                            ? 'warning'
                            : conflict.status === 'ACCEPTED_VARIANCE'
                              ? 'info'
                              : 'muted'
                        }
                        size="sm"
                      >
                        {titleCase(conflict.status)}
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
        </Section>
      ) : null}

      {customFields.length > 0 ? (
        <Section title="Custom fields">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recorded on {reference.connection.name}</CardTitle>
              <CardDescription>
                Custom fields are store-local. Copying them between stores creates new field records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {customFields.map((field) => (
                  <div key={field.name} className="flex justify-between gap-4 border-b py-1.5 text-sm">
                    <dt className="text-muted-foreground">{field.name}</dt>
                    <dd className="font-medium">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </Section>
      ) : null}
    </>
  );
}
