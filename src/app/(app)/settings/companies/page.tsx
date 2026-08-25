import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { countryFlag, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Companies and regions' };
export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/companies');
  const scope = scopeFromAuth(auth);

  const companies = await prisma.company.findMany({
    where: { organisationId: scope.organisationId, deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      regions: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        include: { _count: { select: { connections: true } } },
      },
      _count: { select: { connections: true } },
    },
  });

  return (
    <div className="space-y-4">
      <InfoNote>
        Companies and regions are grouping constructs inside this platform. Deleting one never touches a
        BigCommerce store — it only removes the grouping.
      </InfoNote>

      <Section title="Companies">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Business model</TableHead>
                <TableHead>Reporting currency</TableHead>
                <TableHead>Headquarters</TableHead>
                <TableHead className="text-right">Regions</TableHead>
                <TableHead className="text-right">Stores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <p className="font-medium">{company.name}</p>
                    <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                      {company.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs">{company.code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {titleCase(company.businessModel)}
                    </Badge>
                  </TableCell>
                  <TableCell>{company.reportingCurrency}</TableCell>
                  <TableCell className="text-muted-foreground">{company.headquarters ?? '—'}</TableCell>
                  <TableCell className="tabular text-right">{company.regions.length}</TableCell>
                  <TableCell className="tabular text-right">{company._count.connections}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Regions">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Countries</TableHead>
                <TableHead>Default currency</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead className="text-right">Stores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.flatMap((company) =>
                company.regions.map((region) => (
                  <TableRow key={region.id}>
                    <TableCell className="font-medium">{region.name}</TableCell>
                    <TableCell className="text-muted-foreground">{company.name}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{region.code}</code>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {region.countriesCsv
                          .split(',')
                          .filter(Boolean)
                          .map((code) => `${countryFlag(code)} ${code}`)
                          .join('  ')}
                      </span>
                    </TableCell>
                    <TableCell>{region.defaultCurrency}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{region.timezone}</TableCell>
                    <TableCell className="tabular text-right">{region._count.connections}</TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </Card>
      </Section>
    </div>
  );
}
