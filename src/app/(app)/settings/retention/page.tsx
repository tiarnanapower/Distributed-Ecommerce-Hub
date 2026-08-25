import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Data retention' };
export const dynamic = 'force-dynamic';

const POLICIES = [
  {
    dataType: 'Audit events',
    retention: 'Indefinite',
    rationale:
      'Audit is the record of who changed what. Nothing is pruned automatically; export to CSV and archive before trimming.',
    containsPersonalData: 'Actor name and a hashed IP address.',
  },
  {
    dataType: 'Customer snapshots',
    retention: 'Until the store is disconnected',
    rationale:
      'Deliberately minimal: a masked email and a salted hash. Full personal data is fetched on demand and never persisted.',
    containsPersonalData: 'Masked email, first and last name, masked phone, company.',
  },
  {
    dataType: 'Order snapshots',
    retention: 'Until the store is disconnected',
    rationale:
      'Kept for cross-store reporting. No card data, no full addresses, no payment credentials of any kind.',
    containsPersonalData: 'Customer name and masked email only.',
  },
  {
    dataType: 'Product, pricing and inventory snapshots',
    retention: 'Replaced on each sync',
    rationale:
      'These exist to power comparison, not to mirror the catalogue. Each pull upserts rather than accumulating history.',
    containsPersonalData: 'None.',
  },
  {
    dataType: 'Job and deployment records',
    retention: 'Indefinite',
    rationale: 'Needed to explain what a past deployment did and why an item was blocked.',
    containsPersonalData: 'Initiating user only.',
  },
  {
    dataType: 'Sessions',
    retention: 'Pruned 24 hours after expiry',
    rationale: 'Only the token hash is stored, so an expired row has no residual value.',
    containsPersonalData: 'User agent and a hashed IP address.',
  },
  {
    dataType: 'Credentials',
    retention: 'Until revoked; rotated records are retained',
    rationale:
      'A rotated credential keeps its row so the audit trail shows which token was in use when. The ciphertext can never be surfaced through the UI.',
    containsPersonalData: 'None. The value itself is encrypted and unreadable outside the server.',
  },
];

export default async function RetentionSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/retention');
  const scope = scopeFromAuth(auth);

  const [audit, customers, orders, products, jobs, sessions] = await Promise.all([
    prisma.auditEvent.count({ where: { organisationId: scope.organisationId } }),
    prisma.customerSnapshot.count({ where: { organisationId: scope.organisationId } }),
    prisma.orderSnapshot.count({ where: { organisationId: scope.organisationId } }),
    prisma.productSnapshot.count({ where: { organisationId: scope.organisationId } }),
    prisma.syncJob.count({ where: { organisationId: scope.organisationId } }),
    prisma.session.count({ where: { organisationId: scope.organisationId } }),
  ]);

  return (
    <div className="space-y-4">
      <WarningNote>
        <span className="font-medium">Automatic retention enforcement is not implemented.</span> The policies
        below describe what this build actually stores and why. Scheduled pruning needs a durable job runner —
        see Known limitations.
      </WarningNote>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">What is stored today</CardTitle>
          <CardDescription>Row counts for this organisation.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {[
              ['Audit events', audit],
              ['Customer snapshots', customers],
              ['Order snapshots', orders],
              ['Product snapshots', products],
              ['Jobs', jobs],
              ['Active sessions', sessions],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-4 border-b py-1.5 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular font-medium">{formatNumber(Number(value))}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Retention</TableHead>
              <TableHead>Personal data</TableHead>
              <TableHead>Rationale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {POLICIES.map((policy) => (
              <TableRow key={policy.dataType}>
                <TableCell className="font-medium">{policy.dataType}</TableCell>
                <TableCell className="text-sm">{policy.retention}</TableCell>
                <TableCell className="max-w-xs">
                  <p className="text-xs leading-relaxed text-muted-foreground">{policy.containsPersonalData}</p>
                </TableCell>
                <TableCell className="max-w-lg">
                  <p className="text-xs leading-relaxed text-muted-foreground">{policy.rationale}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <InfoNote>
        The guiding principle is to store as little personal data as the product can function with. Customer
        detail is fetched on demand from BigCommerce rather than mirrored, which keeps this platform out of
        scope for most of what a customer record contains.
      </InfoNote>
    </div>
  );
}
