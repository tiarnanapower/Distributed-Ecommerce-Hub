'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { DataTable, type FacetFilter } from '@/components/shared/data-table';
import { formatMoneyString } from '@/lib/money';
import { countryFlag, formatDateTime, titleCase } from '@/lib/utils';

export interface OrderRow {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  channelName: string | null;
  statusLabel: string;
  statusCategory: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  refundStatus: string;
  currencyCode: string;
  grandTotal: string;
  refundedTotal: string;
  itemCount: number;
  customerName: string | null;
  customerEmailMasked: string | null;
  countryCode: string | null;
  paymentMethod: string | null;
  orderSource: string | null;
  placedAt: Date;
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const facets: FacetFilter[] = useMemo(
    () => [
      {
        columnId: 'storeName',
        label: 'Stores',
        options: [...new Set(orders.map((order) => order.storeName))].sort().map((value) => ({
          value,
          label: value,
        })),
      },
      {
        columnId: 'statusCategory',
        label: 'Status',
        options: [...new Set(orders.map((order) => order.statusCategory))].sort().map((value) => ({
          value,
          label: titleCase(value),
        })),
      },
      {
        columnId: 'currencyCode',
        label: 'Currencies',
        options: [...new Set(orders.map((order) => order.currencyCode))].sort().map((value) => ({
          value,
          label: value,
        })),
      },
      {
        columnId: 'refundStatus',
        label: 'Refunds',
        options: [
          { value: 'none', label: 'No refund' },
          { value: 'partial', label: 'Partially refunded' },
          { value: 'full', label: 'Fully refunded' },
        ],
      },
    ],
    [orders],
  );

  const columns = useMemo<ColumnDef<OrderRow, unknown>[]>(
    () => [
      {
        accessorKey: 'orderNumber',
        header: 'Order',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/orders/${row.original.id}`} className="font-medium hover:underline">
              {row.original.orderNumber}
            </Link>
            <p className="text-xs text-muted-foreground">
              {row.original.itemCount} item{row.original.itemCount === 1 ? '' : 's'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'storeName',
        header: 'Store',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/stores/${row.original.storeId}`} className="text-sm hover:underline">
              <span aria-hidden className="mr-1">
                {countryFlag(row.original.countryCode)}
              </span>
              {row.original.storeName}
            </Link>
            {row.original.channelName ? (
              <p className="truncate text-xs text-muted-foreground">{row.original.channelName}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.original.customerName ?? 'Guest'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.customerEmailMasked ?? '—'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'statusCategory',
        header: 'Status',
        cell: ({ row }) => (
          <div className="space-y-1">
            <Badge
              variant={
                row.original.statusCategory === 'FULFILLED'
                  ? 'success'
                  : row.original.statusCategory === 'CANCELLED'
                    ? 'muted'
                    : row.original.statusCategory === 'REFUNDED'
                      ? 'warning'
                      : row.original.statusCategory === 'FAILED'
                        ? 'destructive'
                        : 'info'
              }
              size="sm"
            >
              {row.original.statusLabel}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Payment',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{titleCase(String(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'fulfilmentStatus',
        header: 'Fulfilment',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{titleCase(String(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'refundStatus',
        header: 'Refund',
        cell: ({ row }) =>
          row.original.refundStatus === 'none' ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div>
              <Badge variant="warning" size="sm">
                {titleCase(row.original.refundStatus)}
              </Badge>
              <p className="tabular mt-0.5 text-xs text-muted-foreground">
                {formatMoneyString(row.original.refundedTotal, row.original.currencyCode)}
              </p>
            </div>
          ),
      },
      {
        accessorKey: 'currencyCode',
        header: 'Currency',
        cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span>,
      },
      {
        accessorKey: 'grandTotal',
        header: 'Total',
        cell: ({ row }) => (
          <span className="tabular font-medium">
            {formatMoneyString(row.original.grandTotal, row.original.currencyCode)}
          </span>
        ),
        sortingFn: (a, b) => Number(a.original.grandTotal) - Number(b.original.grandTotal),
      },
      {
        accessorKey: 'orderSource',
        header: 'Source',
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">{String(getValue() ?? '—')}</span>
        ),
      },
      {
        accessorKey: 'placedAt',
        header: 'Placed',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDateTime(row.original.placedAt)}
          </span>
        ),
        sortingFn: (a, b) => a.original.placedAt.getTime() - b.original.placedAt.getTime(),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={orders}
      searchPlaceholder="Search order number, customer or store…"
      facets={facets}
      exportFilename="orders"
      exportRow={(order) => ({
        orderNumber: order.orderNumber,
        store: order.storeName,
        channel: order.channelName,
        customer: order.customerName,
        customerEmail: order.customerEmailMasked,
        status: order.statusLabel,
        paymentStatus: order.paymentStatus,
        fulfilmentStatus: order.fulfilmentStatus,
        refundStatus: order.refundStatus,
        currency: order.currencyCode,
        total: order.grandTotal,
        refunded: order.refundedTotal,
        items: order.itemCount,
        country: order.countryCode,
        placedAt: order.placedAt,
      })}
      emptyTitle="No orders match"
      emptyDescription="Adjust the filters or widen the store scope."
      pageSize={25}
    />
  );
}
