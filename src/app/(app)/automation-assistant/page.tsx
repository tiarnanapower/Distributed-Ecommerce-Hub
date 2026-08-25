import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { UnavailableState } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { loadShellData } from '@/server/services/scope';

export const metadata: Metadata = { title: 'Automation Assistant' };
export const dynamic = 'force-dynamic';

/**
 * Deliberately inert.
 *
 * This build ships with no AI dependency, no model provider and no assistant.
 * The route exists behind a feature flag so the product surface is honest about
 * what is absent, rather than shipping a chatbot that cannot do anything.
 */
export default async function AutomationAssistantPage() {
  const auth = await requireAuthOrRedirect('/automation-assistant');
  const shell = await loadShellData(scopeFromAuth(auth));

  if (!shell.featureFlags['automation-assistant']) {
    redirect('/settings/feature-flags');
  }

  return (
    <>
      <PageHeader
        title="Automation Assistant"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Automation Assistant' }]}
        description="AI-assisted operations are not configured in this environment."
      />

      <UnavailableState
        title="AI-assisted operations are not configured in this environment"
        icon={Sparkles}
        reason={
          <>
            This build intentionally ships without any AI dependency, model provider, API key or assistant
            surface. Nothing here is disabled pending configuration — the capability simply is not present, and
            the rest of the platform works fully without it.
          </>
        }
      />

      <Card className="mt-4">
        <CardContent className="p-5">
          <p className="text-sm font-semibold">Why there is no assistant here</p>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            A convincing-looking assistant that cannot actually inspect an estate or execute a change is worse
            than none: it invites trust it has not earned, in a product whose entire purpose is telling you
            exactly what it can and cannot do to your live stores. If AI-assisted operations are added later,
            they will go through the same capability registry, dry-run and approval workflow as every other
            write path.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
