'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LogIn, Terminal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/states';
import { signInLocally } from '@/app/actions/session';
import { pluralise } from '@/lib/utils';

export function SignInPanel({
  seeded,
  storeCount,
  nextPath,
}: {
  seeded: boolean;
  storeCount: number;
  nextPath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!seeded) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="No local administrator exists yet"
          description={
            <>
              The database is reachable but has not been seeded, so there is nobody to sign in as. Run the
              setup command and reload this page.
            </>
          }
        />
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            Run in the project directory
          </p>
          <code className="block font-mono text-xs text-muted-foreground">npm run db:setup</code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await signInLocally();
            if (!result.ok) {
              setError(result.error ?? 'Sign-in failed.');
              return;
            }
            router.replace(nextPath && nextPath.startsWith('/') ? nextPath : '/overview');
            router.refresh();
          })
        }
      >
        <LogIn aria-hidden />
        Sign in locally
      </Button>

      {error ? <ErrorState title="Could not sign in" description={error} /> : null}

      <p className="text-center text-xs text-muted-foreground">
        Signs you in as <span className="font-medium text-foreground">Demo Company Admin</span> with{' '}
        {pluralise(storeCount, 'connected store')} available.
      </p>
    </div>
  );
}
