'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/states';
import { cn, formatNumber, toCsv } from '@/lib/utils';

export interface FacetFilter {
  columnId: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Placeholder for the free-text filter box. */
  searchPlaceholder?: string;
  /** Which column the search box filters. Omit to disable search. */
  searchColumnId?: string;
  facets?: FacetFilter[];
  /** Enables row selection and renders the bulk-action bar. */
  enableSelection?: boolean;
  bulkActions?: (selected: TData[], clear: () => void) => React.ReactNode;
  /** Filename stem for the CSV export. Omit to hide the export button. */
  exportFilename?: string;
  /** Maps a row to a flat object for CSV export. */
  exportRow?: (row: TData) => Record<string, unknown>;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  /** Extra controls rendered alongside the toolbar. */
  toolbarExtra?: React.ReactNode;
  rowClassName?: (row: TData) => string | undefined;
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = 'Filter…',
  searchColumnId,
  facets = [],
  enableSelection = false,
  bulkActions,
  exportFilename,
  exportRow,
  emptyTitle = 'Nothing to show',
  emptyDescription = 'No records match the current filters.',
  pageSize = 25,
  toolbarExtra,
  rowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  const allColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableSelection) return columns;
    return [
      {
        id: '__select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
            aria-label="Select all rows on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 32,
      },
      ...columns,
    ];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableRowSelection: enableSelection,
    initialState: { pagination: { pageSize } },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const hasFilters = columnFilters.length > 0 || globalFilter.length > 0;

  const handleExport = () => {
    const rows = table.getFilteredRowModel().rows.map((row) => row.original);
    if (rows.length === 0) {
      toast.error('Nothing to export', { description: 'The current filters match no rows.' });
      return;
    }
    const mapped = exportRow ? rows.map(exportRow) : (rows as Record<string, unknown>[]);
    const csv = toCsv(mapped);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Export ready', { description: `${formatNumber(rows.length)} row(s) exported to CSV.` });
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {searchColumnId || searchPlaceholder ? (
          <Input
            value={
              searchColumnId
                ? ((table.getColumn(searchColumnId)?.getFilterValue() as string) ?? '')
                : globalFilter
            }
            onChange={(event) =>
              searchColumnId
                ? table.getColumn(searchColumnId)?.setFilterValue(event.target.value)
                : setGlobalFilter(event.target.value)
            }
            placeholder={searchPlaceholder}
            className="h-8 w-full max-w-xs"
            aria-label={searchPlaceholder}
          />
        ) : null}

        {facets.map((facet) => {
          const column = table.getColumn(facet.columnId);
          if (!column) return null;
          const value = (column.getFilterValue() as string) ?? '__all';
          return (
            <Select
              key={facet.columnId}
              value={value}
              onValueChange={(next) => column.setFilterValue(next === '__all' ? undefined : next)}
            >
              <SelectTrigger className="h-8 w-auto min-w-[8.5rem] gap-1.5 text-xs">
                <SelectValue placeholder={facet.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All {facet.label.toLowerCase()}</SelectItem>
                {facet.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => {
              setColumnFilters([]);
              setGlobalFilter('');
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}

        {toolbarExtra}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatNumber(table.getFilteredRowModel().rows.length)} of {formatNumber(data.length)}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {exportFilename ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV
            </Button>
          ) : null}
        </div>
      </div>

      {/* Bulk action bar */}
      {enableSelection && selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2">
          <Badge variant="default">{formatNumber(selectedRows.length)} selected</Badge>
          {bulkActions?.(selectedRows, () => setRowSelection({}))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => setRowSelection({})}
          >
            Clear selection
          </Button>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
                          aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} className="border-0" />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[5.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
