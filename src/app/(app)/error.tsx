'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/states';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page render failed', { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <ErrorState
        title="This page could not be loaded"
        description="The failure has been logged on the server. No detail is rendered here so that nothing sensitive reaches the browser."
        hint={error.digest ? `Reference: ${error.digest}` : undefined}
      />
      <Button onClick={reset} variant="outline" className="mt-4 gap-2">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}
