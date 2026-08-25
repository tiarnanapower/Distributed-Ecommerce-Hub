'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Building2, Check, ChevronDown, Globe, Layers, Store } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HealthDot } from '@/components/shared/status-badges';
import { setActiveScope } from '@/app/actions/session';
import type { ShellData } from '@/server/services/scope';
import { cn, countryFlag, truncate } from '@/lib/utils';

interface ScopeSelectorProps {
  shell: ShellData;
}

export function ScopeSelector({ shell }: ScopeSelectorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (next: { companyId?: string | null; storeId?: string | null; channelId?: string | null }) => {
    startTransition(async () => {
      const result = await setActiveScope(next);
      if (!result.ok) {
        toast.error('Could not change scope', { description: result.error });
        return;
      }
      router.refresh();
    });
  };

  const visibleStores = shell.active.companyId
    ? shell.stores.filter((store) => store.companyId === shell.active.companyId)
    : shell.stores;

  const activeStore = shell.stores.find((store) => store.id === shell.active.storeId) ?? null;

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* Organisation — single-tenant in v1, but the control is here so the
          model is visible and future multi-org support has a home. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2 font-medium">
            <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="hidden max-w-[10rem] truncate sm:inline">{shell.organisation.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Organisation</DropdownMenuLabel>
          <DropdownMenuItem className="gap-2">
            <Check className="h-4 w-4 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="truncate font-medium">{shell.organisation.name}</p>
              <p className="text-xs text-muted-foreground">
                Reporting currency {shell.organisation.reportingCurrency}
              </p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
            This deployment holds one organisation. The data model supports several; adding another is a
            settings change rather than a schema change.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-muted-foreground/40" aria-hidden>
        /
      </span>

      {/* Company */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2" disabled={pending}>
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="max-w-[9rem] truncate">{shell.active.companyName ?? 'All companies'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Company or business unit</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => apply({ companyId: null, storeId: null, channelId: null })}>
            <Check className={cn('h-4 w-4', shell.active.companyId ? 'invisible' : 'text-primary')} aria-hidden />
            <span>All companies</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {shell.companies.map((company) => (
            <DropdownMenuItem
              key={company.id}
              onSelect={() => apply({ companyId: company.id, storeId: null, channelId: null })}
            >
              <Check
                className={cn('h-4 w-4', shell.active.companyId === company.id ? 'text-primary' : 'invisible')}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate">{company.name}</p>
                <p className="text-xs text-muted-foreground">{company.meta}</p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-muted-foreground/40" aria-hidden>
        /
      </span>

      {/* Store, store group and channel */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2" disabled={pending}>
            <Store className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="max-w-[11rem] truncate">
              {shell.active.channelName
                ? `${truncate(shell.active.storeName ?? '', 14)} · ${shell.active.channelName}`
                : (shell.active.storeName ?? 'All stores')}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[70vh] w-80 overflow-y-auto thin-scrollbar">
          <DropdownMenuItem onSelect={() => apply({ storeId: null, channelId: null })}>
            <Check className={cn('h-4 w-4', shell.active.storeId ? 'invisible' : 'text-primary')} aria-hidden />
            <span>All stores in scope</span>
          </DropdownMenuItem>

          {shell.storeGroups.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Layers className="h-3 w-3" aria-hidden /> Store groups
              </DropdownMenuLabel>
              <p className="px-2 pb-1 text-xs leading-relaxed text-muted-foreground">
                Groups exist only in this platform. Selecting one filters the pages below it.
              </p>
              {shell.storeGroups.map((group) => (
                <DropdownMenuItem key={group.id} asChild>
                  <a href={`/store-groups/${group.id}`}>
                    <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.meta}</p>
                    </div>
                  </a>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Stores</DropdownMenuLabel>
          {visibleStores.map((store) => (
            <DropdownMenuItem
              key={store.id}
              onSelect={() => apply({ storeId: store.id, channelId: null })}
              className="items-start"
            >
              <Check
                className={cn(
                  'mt-0.5 h-4 w-4',
                  shell.active.storeId === store.id && !shell.active.channelId ? 'text-primary' : 'invisible',
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate">
                  <span aria-hidden>{countryFlag(store.countryCode)}</span>
                  <span className="truncate">{store.name}</span>
                  <HealthDot status={store.healthStatus} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {store.meta}
                  {store.isMaster ? ' · Master' : ''}
                </p>
              </div>
            </DropdownMenuItem>
          ))}

          {activeStore && activeStore.channels.length > 1 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Storefronts in {truncate(activeStore.name, 22)}</DropdownMenuLabel>
              {activeStore.channels.map((channel) => (
                <DropdownMenuItem
                  key={channel.id}
                  onSelect={() => apply({ storeId: activeStore.id, channelId: channel.id })}
                >
                  <Check
                    className={cn('h-4 w-4', shell.active.channelId === channel.id ? 'text-primary' : 'invisible')}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate">{channel.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{channel.status}</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
