'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { STORE_TABS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Tab strip for the store detail page. Tabs are links carrying `?tab=`, so each
 * one is a real, shareable URL and the server renders only the active panel.
 */
export function StoreTabs({ activeTab, counts }: { activeTab: string; counts: Record<string, number> }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="mb-6 overflow-x-auto border-b thin-scrollbar" role="tablist" aria-label="Store sections">
      <div className="flex min-w-max gap-0.5">
        {STORE_TABS.map((tab) => {
          const query = new URLSearchParams(params.toString());
          query.set('tab', tab.id);
          const active = activeTab === tab.id;
          const count = counts[tab.id];

          return (
            <Link
              key={tab.id}
              href={`${pathname}?${query.toString()}`}
              role="tab"
              aria-selected={active}
              className={cn(
                '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {tab.label}
              {count !== undefined && count > 0 ? (
                <span className="tabular rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {count > 999 ? '999+' : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
