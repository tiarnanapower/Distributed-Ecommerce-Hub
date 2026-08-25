'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { DataTable, type FacetFilter } from '@/components/shared/data-table';
import { formatDateTime, titleCase } from '@/lib/utils';

export interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceLabel: string | null;
  resourceId: string | null;
  outcome: string;
  actorLabel: string;
  actorType: string;
  storeName: string | null;
  storeId: string | null;
  beforeSummary: string | null;
  afterSummary: string | null;
  errorSummary: string | null;
  correlationId: string | null;
  createdAt: Date;
}

export function AuditTable({ events }: { events: AuditRow[] }) {
  const facets: FacetFilter[] = useMemo(
    () => [
      {
        columnId: 'action',
        label: 'Actions',
        options: [...new Set(events.map((event) => event.action))].sort().map((value) => ({
          value,
          label: value,
        })),
      },
      {
        columnId: 'resourceType',
        label: 'Resources',
        options: [...new Set(events.map((event) => event.resourceType))].sort().map((value) => ({
          value,
          label: titleCase(value),
        })),
      },
      {
        columnId: 'outcome',
        label: 'Outcomes',
        options: [...new Set(events.map((event) => event.outcome))].sort().map((value) => ({
          value,
          label: titleCase(value),
        })),
      },
    ],
    [events],
  );

  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
        sortingFn: (a, b) => a.original.createdAt.getTime() - b.original.createdAt.getTime(),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => <code className="font-mono text-xs">{row.original.action}</code>,
      },
      {
        accessorKey: 'resourceType',
        header: 'Resource',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.original.resourceLabel ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{titleCase(row.original.resourceType)}</p>
          </div>
        ),
      },
      {
        accessorKey: 'storeName',
        header: 'Store',
        cell: ({ row }) =>
          row.original.storeId ? (
            <Link href={`/stores/${row.original.storeId}`} className="text-sm hover:underline">
              {row.original.storeName}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'actorLabel',
        header: 'Actor',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.original.actorLabel}</p>
            <p className="text-xs text-muted-foreground">{titleCase(row.original.actorType)}</p>
          </div>
        ),
      },
      {
        id: 'change',
        header: 'Change',
        cell: ({ row }) => (
          <div className="min-w-0 max-w-sm">
            {row.original.beforeSummary ? (
              <p className="truncate font-mono text-xs text-muted-foreground line-through">
                {row.original.beforeSummary}
              </p>
            ) : null}
            {row.original.afterSummary ? (
              <p className="truncate font-mono text-xs">{row.original.afterSummary}</p>
            ) : null}
            {row.original.errorSummary ? (
              <p className="truncate text-xs text-destructive">{row.original.errorSummary}</p>
            ) : null}
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'outcome',
        header: 'Outcome',
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.outcome === 'SUCCESS'
                ? 'success'
                : row.original.outcome === 'FAILURE'
                  ? 'destructive'
                  : row.original.outcome === 'PARTIAL'
                    ? 'warning'
                    : row.original.outcome === 'BLOCKED'
                      ? 'muted'
                      : 'info'
            }
            size="sm"
          >
            {titleCase(row.original.outcome)}
          </Badge>
        ),
      },
      {
        accessorKey: 'correlationId',
        header: 'Correlation',
        cell: ({ row }) => (
          <code className="font-mono text-xs text-muted-foreground">
            {row.original.correlationId ?? '—'}
          </code>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={events}
      searchPlaceholder="Search action, resource or correlation id…"
      facets={facets}
      exportFilename="audit-log"
      exportRow={(event) => ({
        timestamp: event.createdAt,
        action: event.action,
        resourceType: event.resourceType,
        resourceLabel: event.resourceLabel,
        resourceId: event.resourceId,
        store: event.storeName,
        actor: event.actorLabel,
        actorType: event.actorType,
        outcome: event.outcome,
        before: event.beforeSummary,
        after: event.afterSummary,
        error: event.errorSummary,
        correlationId: event.correlationId,
      })}
      emptyTitle="No matching events"
      emptyDescription="Adjust the filters to widen the search."
      pageSize={50}
    />
  );
}
