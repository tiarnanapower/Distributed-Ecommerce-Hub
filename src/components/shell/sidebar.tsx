'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NAV_GROUPS, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface SidebarProps {
  productName: string;
  counts: { openConflicts: number; runningJobs: number; pendingApprovals: number };
  featureFlags: Record<string, boolean>;
}

function badgeCount(item: NavItem, counts: SidebarProps['counts']): number {
  switch (item.badge) {
    case 'conflicts':
      return counts.openConflicts;
    case 'jobs':
      return counts.runningJobs;
    case 'approvals':
      return counts.pendingApprovals;
    default:
      return 0;
  }
}

function NavLink({
  item,
  active,
  collapsed,
  count,
  disabled,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count: number;
  disabled: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? (
        <>
          <span className="truncate">{item.label}</span>
          {count > 0 ? (
            <Badge
              variant={item.badge === 'conflicts' ? 'warning' : 'secondary'}
              size="sm"
              className="ml-auto shrink-0"
            >
              {count > 99 ? '99+' : count}
            </Badge>
          ) : null}
          {disabled ? (
            <Badge variant="muted" size="sm" className="ml-auto shrink-0">
              Off
            </Badge>
          ) : null}
        </>
      ) : null}
    </>
  );

  const className = cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
    collapsed && 'justify-center px-0',
    active
      ? 'bg-sidebar-accent font-medium text-white'
      : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white',
    disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-sidebar-foreground',
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className} aria-disabled="true">
            {content}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{item.description}</TooltipContent>
      </Tooltip>
    );
  }

  const link = (
    <Link href={item.href} className={className} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      {content}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="font-medium">{item.label}</span>
        {count > 0 ? ` · ${count}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

function NavContent({
  counts,
  featureFlags,
  collapsed,
  onNavigate,
}: {
  counts: SidebarProps['counts'];
  featureFlags: Record<string, boolean>;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 thin-scrollbar" aria-label="Main">
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter(
          (item) => !item.featureFlag || item.disabledWhenFlagOff || featureFlags[item.featureFlag],
        );
        if (visible.length === 0) return null;

        return (
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden />
            )}
            <div className="space-y-0.5">
              {visible.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  collapsed={collapsed}
                  count={badgeCount(item, counts)}
                  disabled={Boolean(item.featureFlag && !featureFlags[item.featureFlag])}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ productName, collapsed }: { productName: string; collapsed: boolean }) {
  return (
    <Link
      href="/overview"
      className={cn(
        'flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3.5 text-white',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        CC
      </span>
      {!collapsed ? (
        <span className="truncate text-sm font-semibold leading-tight">{productName}</span>
      ) : null}
    </Link>
  );
}

export function Sidebar({ productName, counts, featureFlags }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex',
        collapsed ? 'w-[68px]' : 'w-60',
      )}
    >
      <Brand productName={productName} collapsed={collapsed} />
      <NavContent counts={counts} featureFlags={featureFlags} collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed((value) => !value)}
          className={cn(
            'w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white',
            collapsed && 'justify-center',
          )}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed ? 'Collapse' : null}
        </Button>
      </div>
    </aside>
  );
}

export function MobileNav({ productName, counts, featureFlags }: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Brand productName={productName} collapsed={false} />
        <NavContent
          counts={counts}
          featureFlags={featureFlags}
          collapsed={false}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
