import { AlertTriangle } from 'lucide-react';

import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { loadShellData } from '@/server/services/scope';
import { ensureRunnerStarted } from '@/server/jobs/runner';
import { registerAllJobHandlers } from '@/server/jobs/handlers';

/**
 * The authenticated application shell.
 *
 * Every page beneath this layout is guaranteed an authenticated session and a
 * resolved tenant scope. The job runner is started here because this is the
 * first server render an authenticated user triggers — there is no separate
 * worker process in local development.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuthOrRedirect();
  const scope = scopeFromAuth(auth);
  const shell = await loadShellData(scope);

  registerAllJobHandlers();
  void ensureRunnerStarted();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        productName={shell.productName}
        counts={shell.counts}
        featureFlags={shell.featureFlags}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar shell={shell} user={auth.user} />

        {shell.developmentWarnings.length > 0 ? (
          <div className="flex items-start gap-2 border-b border-warning/30 bg-warning/[0.07] px-4 py-1.5 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            <p className="leading-relaxed">
              <span className="font-medium">Development build.</span> {shell.developmentWarnings.join(' ')}
            </p>
          </div>
        ) : null}

        <main id="main-content" className="flex-1 overflow-y-auto thin-scrollbar">
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
