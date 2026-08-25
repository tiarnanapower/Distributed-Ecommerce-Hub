'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_RANGE_LABELS, DATE_RANGE_PRESETS, type DateRangePreset } from '@/lib/date-range';
import { cn } from '@/lib/utils';

export function DateRangePicker({
  preset,
  from,
  to,
}: {
  preset: DateRangePreset;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from ?? '');
  const [customTo, setCustomTo] = useState(to ?? '');

  const applyPreset = (next: DateRangePreset, extra?: { from?: string; to?: string }) => {
    const query = new URLSearchParams(params.toString());
    query.set('range', next);
    if (next === 'custom') {
      if (extra?.from) query.set('from', extra.from);
      if (extra?.to) query.set('to', extra.to);
    } else {
      query.delete('from');
      query.delete('to');
    }
    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
      setOpen(false);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-0.5">
      {DATE_RANGE_PRESETS.filter((value) => value !== 'custom').map((value) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => applyPreset(value)}
          className={cn(
            'h-7 px-2.5 text-xs',
            preset === value && 'bg-secondary font-medium text-secondary-foreground',
          )}
          aria-pressed={preset === value}
        >
          {DATE_RANGE_LABELS[value]}
        </Button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            className={cn('h-7 gap-1.5 px-2.5 text-xs', preset === 'custom' && 'bg-secondary font-medium')}
            aria-pressed={preset === 'custom'}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Custom
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <p className="text-sm font-medium">Custom range</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-xs">
                From
              </Label>
              <Input
                id="range-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-xs">
                To
              </Label>
              <Input
                id="range-to"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!customFrom || !customTo || customFrom > customTo}
            onClick={() => applyPreset('custom', { from: customFrom, to: customTo })}
          >
            Apply range
          </Button>
          {customFrom && customTo && customFrom > customTo ? (
            <p className="text-xs text-destructive">The start date must be on or before the end date.</p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
