import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatRelativeTime, titleCase } from '@/lib/utils';
import { FlagToggle } from './flag-toggle';

export const metadata: Metadata = { title: 'Feature flags' };
export const dynamic = 'force-dynamic';

export default async function FeatureFlagsPage() {
  const auth = await requireAuthOrRedirect('/settings/feature-flags');
  const scope = scopeFromAuth(auth);

  const flags = await prisma.featureFlag.findMany({
    where: { organisationId: scope.organisationId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const byCategory = new Map<string, typeof flags>();
  for (const flag of flags) {
    byCategory.set(flag.category, [...(byCategory.get(flag.category) ?? []), flag]);
  }

  return (
    <div className="space-y-4">
      <InfoNote>
        Flags gate unfinished or high-risk modules. Turning one on exposes the surface but does not bypass the
        capability registry — a write path that is not implemented stays unavailable regardless.
      </InfoNote>

      {[...byCategory.entries()].map(([category, categoryFlags]) => (
        <Section key={category} title={category}>
          <div className="space-y-3">
            {categoryFlags.map((flag) => (
              <Card key={flag.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{flag.name}</p>
                      <Badge
                        variant={
                          flag.rolloutStage === 'GA'
                            ? 'success'
                            : flag.rolloutStage === 'BETA'
                              ? 'info'
                              : flag.rolloutStage === 'DISABLED'
                                ? 'muted'
                                : 'warning'
                        }
                        size="sm"
                      >
                        {titleCase(flag.rolloutStage)}
                      </Badge>
                      <code className="font-mono text-xs text-muted-foreground">{flag.key}</code>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {flag.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Updated {formatRelativeTime(flag.updatedAt)}
                    </p>
                  </div>
                  <div className="shrink-0 pt-1">
                    <FlagToggle flagKey={flag.key} name={flag.name} isEnabled={flag.isEnabled} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
