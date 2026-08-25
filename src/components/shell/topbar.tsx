'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CircleCheck,
  Info,
  LogOut,
  RefreshCw,
  Settings,
  ShieldAlert,
  TriangleAlert,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DataSourceBadge } from '@/components/shared/status-badges';
import { GlobalSearch } from './global-search';
import { MobileNav } from './sidebar';
import { ScopeSelector } from './scope-selector';
import { dismissAllNotifications, dismissNotification, signOut } from '@/app/actions/session';
import type { ShellData } from '@/server/services/scope';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { USER_ROLE_LABELS, type UserRole } from '@/lib/enums';
import { cn, formatRelativeTime, initialsOf } from '@/lib/utils';

const SEVERITY_ICON = {
  INFO: Info,
  SUCCESS: CircleCheck,
  WARNING: TriangleAlert,
  CRITICAL: ShieldAlert,
} as const;

const SEVERITY_COLOR = {
  INFO: 'text-info',
  SUCCESS: 'text-success',
  WARNING: 'text-warning',
  CRITICAL: 'text-destructive',
} as const;

export function Topbar({ shell, user }: { shell: ShellData; user: AuthenticatedUser }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = shell.counts.unreadNotifications;
  const jobsRunning = shell.counts.runningJobs;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <MobileNav
        productName={shell.productName}
        counts={shell.counts}
        featureFlags={shell.featureFlags}
      />

      <ScopeSelector shell={shell} />

      <div className="ml-auto flex items-center gap-1.5">
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>

        {/* Sync status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" asChild className="gap-1.5 px-2">
              <Link href="/sync">
                <RefreshCw
                  className={cn('h-4 w-4', jobsRunning > 0 ? 'animate-spin text-info' : 'text-muted-foreground')}
                  aria-hidden
                />
                <span className="hidden text-xs md:inline">
                  {jobsRunning > 0 ? `${jobsRunning} running` : 'Idle'}
                </span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {jobsRunning > 0
              ? `${jobsRunning} job${jobsRunning === 1 ? '' : 's'} queued or running. Open the Sync Centre for progress.`
              : 'No jobs are queued or running.'}
          </TooltipContent>
        </Tooltip>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread} unread`}>
              <Bell className="h-4 w-4" aria-hidden />
              {unread > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await dismissAllNotifications();
                      router.refresh();
                    })
                  }
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  Mark all read
                </Button>
              ) : null}
            </div>

            <ScrollArea className="max-h-96">
              {shell.notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing to report. Connection failures, drift and deployment outcomes appear here.
                </p>
              ) : (
                <ul className="divide-y">
                  {shell.notifications.map((notification) => {
                    const Icon =
                      SEVERITY_ICON[notification.severity as keyof typeof SEVERITY_ICON] ?? Info;
                    const colour =
                      SEVERITY_COLOR[notification.severity as keyof typeof SEVERITY_COLOR] ??
                      'text-muted-foreground';
                    return (
                      <li
                        key={notification.id}
                        className={cn('flex gap-3 px-4 py-3', !notification.isRead && 'bg-primary/[0.03]')}
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', colour)} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{notification.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {notification.body}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3">
                            {notification.actionHref ? (
                              <Link
                                href={notification.actionHref}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                {notification.actionLabel ?? 'Open'}
                              </Link>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                            {!notification.isRead ? (
                              <button
                                type="button"
                                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                                disabled={pending}
                                onClick={() =>
                                  startTransition(async () => {
                                    await dismissNotification(notification.id);
                                    router.refresh();
                                  })
                                }
                              >
                                Mark read
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label="Account menu">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: user.avatarColor }}
                aria-hidden
              >
                {initialsOf(user.name)}
              </span>
              <span className="hidden text-sm md:inline">{user.name.split(' ')[0]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Signed in</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Badge variant="secondary" size="sm">
                  {USER_ROLE_LABELS[user.role as UserRole] ?? user.role}
                </Badge>
                <Badge variant="muted" size="sm">
                  {shell.organisation.name}
                </Badge>
              </div>
            </div>

            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <DataSourceBadge
                source={shell.mode.mode === 'demo' ? 'DEMO' : 'MIXED'}
                reason={shell.mode.detail}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{shell.mode.detail}</p>
            </div>

            {shell.developmentWarnings.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <div className="space-y-1.5 px-2 py-1.5">
                  {shell.developmentWarnings.map((warning) => (
                    <p key={warning} className="flex gap-1.5 text-xs leading-relaxed text-warning">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      {warning}
                    </p>
                  ))}
                </div>
              </>
            ) : null}

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings aria-hidden />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/developer">
                <User aria-hidden />
                Session and developer details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => startTransition(async () => void (await signOut()))}
              className="text-destructive focus:text-destructive"
            >
              <LogOut aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
