import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatRow } from '@/components/shared/metric-card';
import { Section } from '@/components/shared/page-header';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { CapabilityBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { getAuthAdapter } from '@/lib/auth/session';
import { product, runtime } from '@/lib/config';
import { describeCommerceMode } from '@/server/services/provider-factory';
import { allUsefulScopes, CAPABILITY_LIST } from '@/lib/commerce/capability-registry';
import { USER_ROLE_LABELS, type UserRole } from '@/lib/enums';
import { formatDateTime, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Developer settings' };
export const dynamic = 'force-dynamic';

export default async function DeveloperSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/developer');
  const scope = scopeFromAuth(auth);
  const mode = describeCommerceMode();
  const adapter = getAuthAdapter();
  const scopes = allUsefulScopes();

  const byStatus = new Map<string, number>();
  for (const capability of CAPABILITY_LIST) {
    byStatus.set(capability.defaultStatus, (byStatus.get(capability.defaultStatus) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <WarningNote>
        This page exposes runtime configuration for debugging. It contains no secrets — the encryption key,
        session secret and any stored token are never read into a page.
      </WarningNote>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Runtime</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <StatRow label="Product" value={`${product.name} ${product.version}`} />
              <StatRow
                label="Operating mode"
                value={
                  <span className="flex items-center gap-1.5">
                    {mode.label}
                    <Badge variant="muted" size="sm">
                      {mode.mode}
                    </Badge>
                  </span>
                }
              />
              <StatRow label="Datastore" value={runtime.usingSqlite() ? 'SQLite' : 'PostgreSQL'} />
              <StatRow label="Environment" value={runtime.isProduction() ? 'production' : 'development'} />
              <StatRow label="Outbound API" value={runtime.outboundApiDisabled() ? 'Disabled' : 'Enabled'} />
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{mode.detail}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Session</CardTitle>
            <CardDescription>Your current authenticated context.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <StatRow label="User" value={auth.user.name} />
              <StatRow label="Email" value={auth.user.email} />
              <StatRow label="Role" value={USER_ROLE_LABELS[auth.user.role as UserRole] ?? auth.user.role} />
              <StatRow
                label="Auth adapter"
                value={
                  <span className="flex items-center gap-1.5">
                    {adapter.displayName}
                    <Badge variant={adapter.isProductionReady ? 'success' : 'warning'} size="sm">
                      {adapter.isProductionReady ? 'Production-ready' : 'Development only'}
                    </Badge>
                  </span>
                }
              />
              <StatRow label="Session expires" value={formatDateTime(auth.expiresAt)} />
              <StatRow
                label="Company scope"
                value={
                  scope.allowedCompanyIds.length === 0
                    ? 'Every company in the organisation'
                    : `${scope.allowedCompanyIds.length} company(ies)`
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Section title="Capability registry summary" description="What the platform claims it can do, before any per-store probe.">
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap gap-2">
              {[...byStatus.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <CapabilityBadge status={status} />
                    <span className="tabular text-sm font-medium">{count}</span>
                  </span>
                ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {formatNumber(CAPABILITY_LIST.length)} capabilities are tracked. A capability is only ever shown
              as available when the operation is implemented, the required scope is granted and the store
              supports it.
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="OAuth scopes this platform can use"
        description="Grant these on the BigCommerce API account. Anything missing downgrades the affected capabilities rather than failing silently."
      >
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Used by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scopes.map((entry) => (
                <TableRow key={entry.scope}>
                  <TableCell>
                    <code className="font-mono text-xs">{entry.scope}</code>
                  </TableCell>
                  <TableCell className="max-w-2xl">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {entry.usedBy.join(' · ')}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <InfoNote>
        Scope names are taken from the BigCommerce API-accounts documentation. Where a capability has no scope
        listed, no public API exists for it at all.
      </InfoNote>
    </div>
  );
}
