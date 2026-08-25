import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { Section } from '@/components/shared/page-header';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { developmentWarnings, runtime } from '@/lib/config';
import { formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Credential encryption' };
export const dynamic = 'force-dynamic';

export default async function SecuritySettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/security');
  const scope = scopeFromAuth(auth);

  const credentials = await prisma.credentialRecord.findMany({
    where: { organisationId: scope.organisationId },
    include: { connection: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const active = credentials.filter((credential) => credential.status === 'ACTIVE').length;
  const invalid = credentials.filter((credential) => credential.status === 'INVALID').length;
  const warnings = developmentWarnings();

  return (
    <div className="space-y-4">
      {warnings.length > 0 ? (
        <WarningNote>
          <span className="font-medium">This deployment uses local-only primitives.</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </WarningNote>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ShieldCheck className="h-4 w-4 text-info" aria-hidden />
            Encryption at rest
          </CardTitle>
          <CardDescription>How stored BigCommerce credentials are protected.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <StatRow label="Algorithm" value={<code className="font-mono text-xs">AES-256-GCM</code>} />
            <StatRow
              label="Key source"
              value={
                <span className="flex items-center gap-1.5">
                  <code className="font-mono text-xs">ENCRYPTION_KEY</code>
                  <Badge variant="warning" size="sm">
                    Environment variable
                  </Badge>
                </span>
              }
              tooltip="Adequate for a laptop. In production the key must come from a managed KMS or secret manager."
            />
            <StatRow label="Key version" value="1" />
            <StatRow
              label="Datastore"
              value={runtime.usingSqlite() ? 'SQLite (local file)' : 'PostgreSQL'}
            />
            <StatRow label="Active credentials" value={formatNumber(active)} />
            <StatRow
              label="Invalid credentials"
              value={
                <span className={invalid > 0 ? 'text-destructive' : undefined}>{formatNumber(invalid)}</span>
              }
            />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              What this build does
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                'Encrypts every stored credential with AES-256-GCM before it touches the database.',
                'Decrypts only server-side, at the moment an outbound API call is made.',
                'Never returns a secret from any route — only a masked hint and a fingerprint.',
                'Redacts secrets from every log line, error message and audit row.',
                'Stores only the SHA-256 hash of a session token, never the token itself.',
                'Hashes client IP addresses with a keyed HMAC rather than storing them in the clear.',
                'Validates every mutation input with Zod before it reaches the database.',
                'Enforces the organisation boundary in a single choke point that every query passes through.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              What must change before production
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                'Move the encryption key into a managed KMS or secret manager with rotation.',
                'Replace local authentication with a real identity provider and MFA.',
                'Move from SQLite to PostgreSQL with backups and point-in-time recovery.',
                'Add a Content Security Policy and run a dependency audit in CI.',
                'Enable a durable job queue so background work survives a process restart.',
                'Assign distinct roles so a requester cannot approve their own deployment.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Section title="Stored credentials">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Masked value</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last validated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((credential) => (
                <TableRow key={credential.id}>
                  <TableCell className="font-medium">{credential.connection.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {titleCase(credential.credentialType)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="flex items-center gap-1.5 font-mono text-xs">
                      <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                      {credential.maskedHint}
                    </code>
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">{credential.fingerprint}</code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        credential.status === 'ACTIVE'
                          ? 'success'
                          : credential.status === 'INVALID'
                            ? 'destructive'
                            : 'muted'
                      }
                      size="sm"
                    >
                      {titleCase(credential.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(credential.lastValidatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <InfoNote>
        <KeyRound className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        Rotating a credential retires the previous record rather than deleting it, so the audit trail shows when
        each token was in use. The old ciphertext is kept but marked rotated; it can never be surfaced through
        the UI.
      </InfoNote>
    </div>
  );
}
