'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactNumber } from '@/lib/utils';

/**
 * Chart palette.
 *
 * Categorical hues are spaced far enough apart to stay distinguishable, and
 * each is paired with a label in the tooltip and legend so colour is never the
 * only way to read the chart.
 */
export const CHART_COLORS = [
  '#2563eb',
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0891b2',
  '#4d7c0f',
  '#c2410c',
  '#4f46e5',
  '#a21caf',
] as const;

const axisStyle = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } as const;

function TooltipCard({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[];
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined ? <p className="mb-1 font-medium">{String(label)}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name ?? entry.dataKey}</span>
            <span className="tabular ml-auto font-medium">
              {typeof entry.value === 'number' && valueFormatter
                ? valueFormatter(entry.value)
                : String(entry.value ?? '—')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TrendChartProps {
  data: { date: string; revenue: number; orders: number }[];
  currencyCode: string;
  height?: number;
}

export function RevenueTrendChart({ data, currencyCode, height = 260 }: TrendChartProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => formatCurrency(value)}
        />
        <Tooltip content={<TooltipCard valueFormatter={formatCurrency} />} />
        <Area
          type="monotone"
          dataKey="revenue"
          name={`Revenue (${currencyCode})`}
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OrdersTrendChart({ data, height = 220 }: { data: { date: string; orders: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<TooltipCard valueFormatter={(value) => formatCompactNumber(value)} />} />
        <Line
          type="monotone"
          dataKey="orders"
          name="Orders"
          stroke={CHART_COLORS[1]}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface CategoryDatum {
  label: string;
  amount: number;
}

export function HorizontalBarChart({
  data,
  currencyCode,
  height = 260,
  colorIndex = 0,
}: {
  data: CategoryDatum[];
  currencyCode: string;
  height?: number;
  colorIndex?: number;
}) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCurrency(value)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip content={<TooltipCard valueFormatter={formatCurrency} />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="amount" name={`Revenue (${currencyCode})`} radius={[0, 4, 4, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[(colorIndex + index) % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  currencyCode,
  height = 240,
}: {
  data: CategoryDatum[];
  currencyCode: string;
  height?: number;
}) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="label"
          innerRadius="55%"
          outerRadius="82%"
          paddingAngle={2}
          strokeWidth={1}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipCard valueFormatter={formatCurrency} />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ComparisonBarChart({
  data,
  height = 300,
  bars,
}: {
  data: Record<string, string | number>[];
  height?: number;
  bars: { dataKey: string; name: string; colorIndex: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={70} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<TooltipCard valueFormatter={(value) => formatCompactNumber(value)} />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Legend
          verticalAlign="top"
          height={28}
          formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name}
            fill={CHART_COLORS[bar.colorIndex % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
