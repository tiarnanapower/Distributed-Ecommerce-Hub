import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatPercent } from '@/lib/utils';

export interface MetricCardProps {
  label: string;
  /** Rendered as-is; pass a formatted string, never a raw float. */
  value: ReactNode;
  /** Small line under the value. */
  hint?: ReactNode;
  /** Percentage change against the comparison period. */
  deltaPercent?: number | null;
  /** Whether a positive delta is good. Refund rate, for example, inverts this. */
  higherIsBetter?: boolean;
  /** Explains where the number comes from, or why it is unavailable. */
  tooltip?: string;
  href?: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
  /** Renders the "unavailable" treatment instead of a value. */
  unavailableReason?: string;
}

export function MetricCard({
  label,
  value,
  hint,
  deltaPercent,
  higherIsBetter = true,
  tooltip,
  href,
  tone = 'default',
  className,
  unavailableReason,
}: MetricCardProps) {
  const hasDelta = deltaPercent !== null && deltaPercent !== undefined && Number.isFinite(deltaPercent);
  const isUp = hasDelta && deltaPercent > 0;
  const isFlat = hasDelta && Math.abs(deltaPercent) < 0.05;
  const isGood = hasDelta && (higherIsBetter ? deltaPercent > 0 : deltaPercent < 0);

  const body = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
                aria-label={`About ${label}`}
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {unavailableReason ? (
        <>
          <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-muted-foreground">—</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{unavailableReason}</p>
        </>
      ) : (
        <>
          <p
            className={cn(
              'tabular mt-2 text-2xl font-semibold tracking-tight',
              tone === 'success' && 'text-success',
              tone === 'warning' && 'text-warning',
              tone === 'destructive' && 'text-destructive',
            )}
          >
            {value}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {hasDelta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  isFlat ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive',
                )}
              >
                {isFlat ? (
                  <ArrowRight className="h-3 w-3" aria-hidden />
                ) : isUp ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="h-3 w-3" aria-hidden />
                )}
                {formatPercent(Math.abs(deltaPercent))}
              </span>
            ) : null}
            {hint ? <span>{hint}</span> : null}
          </div>
        </>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Card
        className={cn(
          'transition-colors hover:border-primary/40 focus-within:border-primary/40',
          className,
        )}
      >
        <Link href={href} className="block rounded-lg focus-visible:outline-none">
          {body}
        </Link>
      </Card>
    );
  }

  return <Card className={className}>{body}</Card>;
}

/** A dense stat row for use inside cards and drawers. */
export function StatRow({
  label,
  value,
  tooltip,
  className,
}: {
  label: string;
  value: ReactNode;
  tooltip?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 text-sm', className)}>
      <dt className="flex items-center gap-1 text-muted-foreground">
        {label}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground/60" aria-label={`About ${label}`}>
                <HelpCircle className="h-3 w-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </dt>
      <dd className="tabular min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
