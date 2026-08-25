/**
 * Date-range presets.
 *
 * Deliberately dependency-free and separate from the analytics service: the
 * date picker is a client component, and importing it from a module that
 * touches Prisma would pull the database client into the browser bundle.
 */
export const DATE_RANGE_PRESETS = [
  'today',
  'last7',
  'last30',
  'quarterToDate',
  'yearToDate',
  'custom',
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  quarterToDate: 'Quarter to date',
  yearToDate: 'Year to date',
  custom: 'Custom range',
};

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

export function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

export function resolveDateRange(
  preset: DateRangePreset,
  custom?: { from?: Date; to?: Date },
  now = new Date(),
): DateRange {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'today':
      return { from: startOfToday, to: endOfToday, label: 'Today' };
    case 'last7': {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 6);
      return { from, to: endOfToday, label: 'Last 7 days' };
    }
    case 'quarterToDate': {
      const quarter = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), quarter * 3, 1), to: endOfToday, label: 'Quarter to date' };
    }
    case 'yearToDate':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfToday, label: 'Year to date' };
    case 'custom': {
      const from = custom?.from ?? new Date(startOfToday.getTime() - 29 * 86_400_000);
      const to = custom?.to ?? endOfToday;
      return { from, to, label: 'Custom range' };
    }
    default: {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 29);
      return { from, to: endOfToday, label: 'Last 30 days' };
    }
  }
}
