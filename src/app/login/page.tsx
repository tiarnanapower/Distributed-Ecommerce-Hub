import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AlertTriangle, Database, KeyRound, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getAuthAdapter, getAuthContext } from '@/lib/auth/session';
import { developmentWarnings, product, runtime } from '@/lib/config';
import { prisma } from '@/lib/db';
import { SignInPanel } from './sign-in-panel';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getAuthContext();
  const { next } = await searchParams;

  if (auth) {
    redirect(next && next.startsWith('/') ? next : '/overview');
  }

  const adapter = getAuthAdapter();

  // Tell the operator honestly whether the demo estate has been seeded.
  const [userCount, storeCount, organisation] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.storeConnection.count().catch(() => 0),
    prisma.organisation.findFirst({ select: { name: true } }).catch(() => null),
  ]);

  const seeded = userCount > 0;
  const warnings = developmentWarnings();

  return (
    <main id="main-content" className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
      {/* Narrative panel */}
      <section className="relative hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {product.initials}
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{product.name}</p>
              <p className="text-xs text-sidebar-foreground/70">{product.tagline}</p>
            </div>
          </div>
        </div>

        <div className="max-w-lg">
          <h2 className="text-2xl font-semibold leading-tight text-white">
            One control plane for an estate of BigCommerce stores.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-sidebar-foreground/80">
            Connect independent stores, Multi-Storefront channels, regional and brand storefronts, and the
            development stores behind them. Compare them, understand where they have drifted, and change them
            deliberately — with every action recorded.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              'Inheritance you can see: every value shows where it came from.',
              'A capability registry that never claims an operation the platform cannot perform.',
              'Dry-run first: blast radius, validation and typed confirmation before anything is written.',
              'Credentials encrypted at rest, redacted everywhere, never returned to the browser.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="text-sidebar-foreground/85">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-sidebar-foreground/50">
          {product.vendor} · Version {product.version}
        </p>
      </section>

      {/* Sign-in panel */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {product.initials}
              </span>
              <p className="font-semibold">{product.name}</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {seeded
              ? `You will be signed in as the seeded administrator for ${organisation?.name ?? 'the demo organisation'}.`
              : 'The demo organisation has not been created yet.'}
          </p>

          <div className="mt-8">
            <SignInPanel seeded={seeded} storeCount={storeCount} nextPath={next} />
          </div>

          {/* The development warning the brief asks for, stated plainly. */}
          <Card className="mt-8 border-warning/30 bg-warning/[0.05]">
            <CardContent className="space-y-2.5 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                <p className="text-sm font-semibold">Development build</p>
                <Badge variant="warning" size="sm">
                  Not production-ready
                </Badge>
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {warnings.map((warning) => (
                  <li key={warning} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" aria-hidden />
                    {warning}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <dl className="mt-6 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              <dt className="font-medium text-foreground">Authentication</dt>
              <dd>{adapter.displayName}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5" aria-hidden />
              <dt className="font-medium text-foreground">Datastore</dt>
              <dd>{runtime.usingSqlite() ? 'SQLite (local file)' : 'PostgreSQL'}</dd>
            </div>
          </dl>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Public registration is intentionally absent. To move to Auth.js, Microsoft Entra ID, Okta, Google
            Workspace, SAML or OpenID Connect, implement the <code className="font-mono">AuthAdapter</code>{' '}
            interface — no other application code changes.
          </p>
        </div>
      </section>
    </main>
  );
}
