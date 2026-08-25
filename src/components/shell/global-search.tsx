'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { COMMAND_NAV } from '@/lib/navigation';
import { SEARCH_ENTITY_LABELS, type SearchResult } from '@/lib/search-types';
import { groupBy } from '@/lib/utils';

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Debounced fetch: the search endpoint enforces the tenant boundary, so the
  // client can query freely without leaking scope decisions into the browser.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Search request failed');
        const payload = (await response.json()) as { results: SearchResult[] };
        setResults(payload.results ?? []);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const grouped = useMemo(() => groupBy(results, (result) => result.entity), [results]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2 text-muted-foreground sm:w-64"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search the estate">
        <CommandInput
          placeholder="Search stores, products, orders, customers, jobs, audit events…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Searching…
            </div>
          ) : null}

          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <CommandEmpty>
              Nothing matched “{query}”. Search covers stores, storefronts, products, orders, customers,
              customer groups, jobs, deployments, pages, themes and audit events within your organisation.
            </CommandEmpty>
          ) : null}

          {query.trim().length < 2
            ? COMMAND_NAV.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.href}
                        value={`${item.label} ${item.description}`}
                        onSelect={() => go(item.href)}
                      >
                        <Icon className="text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate">{item.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))
            : [...grouped.entries()].map(([entity, items]) => (
                <CommandGroup key={entity} heading={SEARCH_ENTITY_LABELS[entity]}>
                  {items.map((result) => (
                    <CommandItem
                      key={`${result.entity}-${result.id}`}
                      value={`${result.title} ${result.subtitle}`}
                      onSelect={() => go(result.href)}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{result.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
