'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check, Rocket, Search, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/shared/states';
import { HealthDot } from '@/components/shared/status-badges';
import type { CatalogMatrix, MatrixRow } from '@/server/services/catalog';
import { formatMoneyString } from '@/lib/money';
import { cn, countryFlag, formatNumber, toCsv } from '@/lib/utils';

const STATUS_LABEL = {
  CONSISTENT: 'Consistent',
  OVERRIDDEN: 'Local override',
  DIVERGING: 'Diverging',
  MISSING: 'Missing somewhere',
} as const;

export function ProductMatrix({ matrix }: { matrix: CatalogMatrix }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('__all');
  const [brandFilter, setBrandFilter] = useState<string>('__all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleStores, setVisibleStores] = useState<Set<string>>(
    new Set(matrix.stores.map((store) => store.id)),
  );

  const brands = useMemo(
    () => [...new Set(matrix.rows.map((row) => row.brandName).filter(Boolean))].sort() as string[],
    [matrix.rows],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return matrix.rows.filter((row) => {
      if (statusFilter !== '__all' && row.status !== statusFilter) return false;
      if (brandFilter !== '__all' && row.brandName !== brandFilter) return false;
      if (!term) return true;
      return (
        row.sku.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        (row.brandName ?? '').toLowerCase().includes(term)
      );
    });
  }, [matrix.rows, search, statusFilter, brandFilter]);

  const stores = matrix.stores.filter((store) => visibleStores.has(store.id));

  const exportCsv = () => {
    const flat = rows.map((row) => {
      const base: Record<string, unknown> = {
        sku: row.sku,
        name: row.name,
        brand: row.brandName ?? '',
        status: row.status,
        presentIn: row.presentIn,
        missingIn: row.missingIn,
      };
      for (const store of stores) {
        const cell = row.cells[store.id];
        base[`${store.name} — price`] = cell?.present ? `${cell.price} ${cell.currencyCode}` : 'ABSENT';
        base[`${store.name} — visible`] = cell?.present ? (cell.isVisible ? 'yes' : 'no') : '';
      }
      return base;
    });
    const blob = new Blob([toCsv(flat)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `catalog-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by SKU, name or brand…"
            className="h-8 w-64 pl-8"
            aria-label="Filter products"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[10rem] text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All statuses</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[9rem] text-xs">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All brands</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatNumber(rows.length)} of {formatNumber(matrix.rows.length)} SKUs ·{' '}
            {formatNumber(stores.length)} stores
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Store column toggles */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Columns:</span>
        {matrix.stores.map((store) => (
          <label
            key={store.id}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs transition-colors',
              !visibleStores.has(store.id) && 'opacity-50',
            )}
          >
            <Checkbox
              checked={visibleStores.has(store.id)}
              onCheckedChange={(value) =>
                setVisibleStores((current) => {
                  const next = new Set(current);
                  if (value) next.add(store.id);
                  else next.delete(store.id);
                  return next;
                })
              }
              className="h-3 w-3"
              aria-label={`Show ${store.name}`}
            />
            <span aria-hidden>{countryFlag(store.countryCode)}</span>
            {store.name}
          </label>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2">
          <Badge>{selected.size} SKU{selected.size === 1 ? '' : 's'} selected</Badge>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
            <Link
              href={`/deployments/new?category=PRODUCTS&skus=${[...selected].map(encodeURIComponent).join(',')}`}
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              Plan a deployment
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {/* Matrix */}
      {rows.length === 0 ? (
        <EmptyState
          title="No products match"
          description="Adjust the filters, or run a catalog pull to capture product snapshots."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto thin-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[16rem] bg-background">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={
                          selected.size === rows.length
                            ? true
                            : selected.size > 0
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={(value) =>
                          setSelected(value ? new Set(rows.map((row) => row.sku)) : new Set())
                        }
                        aria-label="Select all visible products"
                      />
                      Product
                    </div>
                  </TableHead>
                  <TableHead className="min-w-[7rem]">Status</TableHead>
                  {stores.map((store) => (
                    <TableHead key={store.id} className="min-w-[9rem]">
                      <Link href={`/stores/${store.id}`} className="flex items-center gap-1 hover:underline">
                        <HealthDot status={store.healthStatus} />
                        <span aria-hidden>{countryFlag(store.countryCode)}</span>
                        <span className="truncate">{store.name}</span>
                        {store.isMaster ? (
                          <Badge variant="warning" size="sm">
                            Master
                          </Badge>
                        ) : null}
                      </Link>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <MatrixRowView
                    key={row.sku}
                    row={row}
                    stores={stores}
                    selected={selected.has(row.sku)}
                    onToggle={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(row.sku)) next.delete(row.sku);
                        else next.add(row.sku);
                        return next;
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Products are matched across stores by SKU. BigCommerce product ids are store-local and are never assumed
        to correspond. A price difference between stores in different currencies is expected and is not counted
        as drift; a difference within the same currency is.
      </p>
    </div>
  );
}

function MatrixRowView({
  row,
  stores,
  selected,
  onToggle,
}: {
  row: MatrixRow;
  stores: CatalogMatrix['stores'];
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell className="sticky left-0 z-10 bg-background">
        <div className="flex items-start gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${row.sku}`} className="mt-0.5" />
          <div className="min-w-0">
            <Link href={`/catalog/${encodeURIComponent(row.sku)}`} className="font-medium hover:underline">
              {row.name}
            </Link>
            <p className="font-mono text-xs text-muted-foreground">{row.sku}</p>
            {row.brandName ? (
              <p className="text-xs text-muted-foreground">{row.brandName}</p>
            ) : null}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <Badge
          variant={
            row.status === 'CONSISTENT'
              ? 'success'
              : row.status === 'OVERRIDDEN'
                ? 'secondary'
                : row.status === 'DIVERGING'
                  ? 'warning'
                  : 'destructive'
          }
          size="sm"
        >
          {STATUS_LABEL[row.status]}
        </Badge>
        {row.missingIn > 0 ? (
          <p className="mt-0.5 text-xs text-muted-foreground">Absent from {row.missingIn}</p>
        ) : null}
      </TableCell>

      {stores.map((store) => {
        const cell = row.cells[store.id];
        if (!cell || !cell.present) {
          return (
            <TableCell key={store.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Absent
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {row.sku} does not exist in {store.name}. Creating it there would produce a new store-local
                  product id.
                </TooltipContent>
              </Tooltip>
            </TableCell>
          );
        }

        const hasDrift = cell.driftFields.length > 0;

        return (
          <TableCell key={store.id}>
            <div className="space-y-0.5">
              <p className="tabular text-sm font-medium">
                {formatMoneyString(cell.price ?? '0', cell.currencyCode)}
              </p>
              {cell.salePrice ? (
                <p className="tabular text-xs text-success">
                  Sale {formatMoneyString(cell.salePrice, cell.currencyCode)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {!cell.isVisible ? (
                  <Badge variant="muted" size="sm">
                    Hidden
                  </Badge>
                ) : null}
                {cell.isOverridden ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" size="sm">
                        Override
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      A deliberate local value is recorded for this product in {store.name}.
                    </TooltipContent>
                  </Tooltip>
                ) : hasDrift ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="warning" size="sm">
                        Drift
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      Differs from the master on {cell.driftFields.join(', ')} with no override to explain it.
                    </TooltipContent>
                  </Tooltip>
                ) : store.isMaster ? null : (
                  <span className="inline-flex items-center gap-0.5 text-xs text-success">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                )}
              </div>
            </div>
          </TableCell>
        );
      })}
    </TableRow>
  );
}
