import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        That page does not exist. It may have been renamed, or the record it referred to may have been
        removed from this organisation.
      </p>
      <Button asChild className="mt-6">
        <Link href="/overview">Back to the overview</Link>
      </Button>
    </main>
  );
}
