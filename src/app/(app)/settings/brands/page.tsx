import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Brands and environments' };
export const dynamic = 'force-dynamic';

export default async function BrandSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/brands');
  const scope = scopeFromAuth(auth);

  const [brands, environments, groups] = await Promise.all([
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
    prisma.storeGroup.findMany({
      where: { organisationId: scope.organisationId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { company: { select: { name: true } }, _count: { select: { members: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <Section title="Brands">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead className="text-right">Stores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {brand.description}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded border"
                        style={{ backgroundColor: brand.colorHex }}
                        aria-hidden
                      />
                      <code className="font-mono text-xs">{brand.colorHex}</code>
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{brand._count.connections}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Environments" description="Guard rails vary by environment.">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Environment</TableHead>
                <TableHead>Production</TableHead>
                <TableHead>Guard rails</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Stores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((environment) => (
                <TableRow key={environment.id}>
                  <TableCell className="font-medium">{environment.name}</TableCell>
                  <TableCell>
                    <Badge variant={environment.isProduction ? 'default' : 'muted'} size="sm">
                      {environment.isProduction ? 'Yes' : 'No'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        environment.guardrailLevel === 'STRICT'
                          ? 'destructive'
                          : environment.guardrailLevel === 'STANDARD'
                            ? 'warning'
                            : 'muted'
                      }
                      size="sm"
                    >
                      {titleCase(environment.guardrailLevel)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {environment.description}
                  </TableCell>
                  <TableCell className="tabular text-right">{environment._count.connections}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Store groups">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>
                    <p className="font-medium">{group.name}</p>
                    <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                      {group.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {titleCase(group.purpose)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.company?.name ?? 'Organisation-wide'}
                  </TableCell>
                  <TableCell className="tabular text-right">{group._count.members}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <InfoNote>
        None of these groupings exist in BigCommerce. They are how an estate of independent stores is made
        navigable and targetable.
      </InfoNote>
    </div>
  );
}
