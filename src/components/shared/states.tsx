import Link from 'next/link';
import { AlertTriangle, Inbox, Info, Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
      {action ? (
        <div className="mt-4">
          {action.href ? (
            <Button asChild size="sm">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  hint,
  className,
}: {
  title?: string;
  description: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn('border-destructive/30 bg-destructive/[0.03]', className)}>
      <CardContent className="flex gap-3 p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
          {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Used wherever a capability is unavailable. Explains *why* rather than simply
 * hiding the feature, which is the honest behaviour the product depends on.
 */
export function UnavailableState({
  title,
  reason,
  docsHref,
  className,
  icon: Icon = Lock,
}: {
  title: string;
  reason: ReactNode;
  docsHref?: string;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className={cn('border-dashed bg-muted/30', className)}>
      <CardContent className="flex gap-3 p-5">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{reason}</div>
          {docsHref ? (
            <a
              href={docsHref}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              BigCommerce documentation ↗
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-md border border-info/25 bg-info/[0.05] px-3.5 py-2.5 text-sm text-foreground',
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function WarningNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-md border border-warning/30 bg-warning/[0.06] px-3.5 py-2.5 text-sm text-foreground',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border" aria-busy aria-label="Loading table">
      <div className="flex gap-4 border-b px-3 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b px-3 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MetricSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy aria-label="Loading metrics">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <Card aria-busy>
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-3" style={{ width: `${100 - index * 12}%` }} />
        ))}
      </CardContent>
    </Card>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <MetricSkeleton />
      <TableSkeleton />
    </div>
  );
}
