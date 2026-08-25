'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Root error boundary. The message shown is deliberately generic: detailed
 * errors are logged server-side and never rendered, so a stack trace cannot
 * leak a store hash or a request path to the browser.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled application error', { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page could not be rendered. The failure has been logged on the server; no detail is shown here so
        that nothing sensitive is exposed in the browser.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <Button onClick={reset} className="mt-6 gap-2">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Try again
      </Button>
    </main>
  );
}
