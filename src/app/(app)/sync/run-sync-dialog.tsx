'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { HealthDot } from '@/components/shared/status-badges';
import { runSync } from '@/app/actions/sync';
import {
  FULL_SYNC_SEQUENCE,
  RUNNABLE_JOB_DESCRIPTIONS,
  RUNNABLE_JOB_SCOPES,
  RUNNABLE_JOB_TYPES,
  type RunnableJobType,
} from '@/lib/sync-jobs';
import { JOB_TYPE_LABELS, type JobType } from '@/lib/enums';
import { countryFlag } from '@/lib/utils';

export interface SyncStoreOption {
  id: string;
  name: string;
  countryCode: string;
  healthStatus: string;
  isDemo: boolean;
  isPlanned: boolean;
}

/**
 * Starts read-only sync jobs.
 *
 * These jobs pull data *from* BigCommerce into this platform. Nothing is written
 * back to any store, which is why there is no dry-run or confirmation step here
 * — unlike a deployment, this cannot change what a customer sees.
 */
export function RunSyncDialog({
  stores,
  initialJobTypes,
  initialStoreIds,
  autoOpen = false,
  triggerLabel = 'Run a sync',
}: {
  stores: SyncStoreOption[];
  initialJobTypes?: RunnableJobType[];
  initialStoreIds?: string[];
  autoOpen?: boolean;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(autoOpen);

  const [jobTypes, setJobTypes] = useState<Set<RunnableJobType>>(
    new Set(initialJobTypes && initialJobTypes.length > 0 ? initialJobTypes : ['CATALOG_PULL']),
  );
  const [storeIds, setStoreIds] = useState<Set<string>>(
    new Set(
      initialStoreIds && initialStoreIds.length > 0
        ? initialStoreIds
        : stores.filter((store) => !store.isDemo && !store.isPlanned).map((store) => store.id),
    ),
  );
  const [sinceDays, setSinceDays] = useState('90');

  // A link such as /sync?action=catalog&targets=… lands here with the dialog
  // already open and the right things ticked.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const selectedStores = stores.filter((store) => storeIds.has(store.id));
  const liveCount = selectedStores.filter((store) => !store.isDemo).length;
  const demoCount = selectedStores.filter((store) => store.isDemo).length;
  const plannedSelected = selectedStores.filter((store) => store.isPlanned);
  const includesOrders = jobTypes.has('ORDER_PULL');

  const submit = () => {
    startTransition(async () => {
      const result = await runSync({
        jobTypes: [...jobTypes],
        connectionIds: [...storeIds],
        sinceDays: Number(sinceDays),
      });

      if (!result.ok) {
        toast.error('Could not start the sync', { description: result.error ?? result.hint });
        return;
      }

      toast.success(
        `${result.data!.queued} job${result.data!.queued === 1 ? '' : 's'} queued`,
        { description: 'Progress appears below as each one runs.' },
      );
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <RefreshCw className="h-4 w-4" aria-hidden />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent size="lg" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Run a sync</DialogTitle>
          <DialogDescription>
            Pulls data from BigCommerce into this platform. Nothing is written back to any store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* What to sync */}
          <fieldset className="space-y-2">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium">What to sync</legend>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setJobTypes(new Set(FULL_SYNC_SEQUENCE))}
              >
                Select everything
              </button>
            </div>

            <div className="space-y-1.5">
              {RUNNABLE_JOB_TYPES.map((jobType) => (
                <label
                  key={jobType}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors hover:border-primary/40"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={jobTypes.has(jobType)}
                    onCheckedChange={(value) =>
                      setJobTypes((current) => {
                        const next = new Set(current);
                        if (value) next.add(jobType);
                        else next.delete(jobType);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {JOB_TYPE_LABELS[jobType as JobType]}
                      {RUNNABLE_JOB_SCOPES[jobType] ? (
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                          {RUNNABLE_JOB_SCOPES[jobType]}
                        </code>
                      ) : (
                        <Badge variant="muted" size="sm">
                          No API call
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {RUNNABLE_JOB_DESCRIPTIONS[jobType]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {includesOrders ? (
            <div className="space-y-1.5">
              <Label htmlFor="sync-since">How far back to pull orders</Label>
              <Select value={sinceDays} onValueChange={setSinceDays}>
                <SelectTrigger id="sync-since" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                  <SelectItem value="730">Last 24 months</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                A wider window means more API calls and a longer run. Orders are paged 100 at a time and the
                client backs off when BigCommerce rate-limits it.
              </p>
            </div>
          ) : null}

          {/* Which stores */}
          <fieldset className="space-y-2">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium">Which stores</legend>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setStoreIds(new Set(stores.filter((store) => !store.isDemo).map((s) => s.id)))
                  }
                >
                  Live stores only
                </button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setStoreIds(new Set(stores.map((store) => store.id)))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setStoreIds(new Set())}
                >
                  None
                </button>
              </div>
            </div>

            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 thin-scrollbar sm:grid-cols-2">
              {stores.map((store) => (
                <label
                  key={store.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={storeIds.has(store.id)}
                    onCheckedChange={(value) =>
                      setStoreIds((current) => {
                        const next = new Set(current);
                        if (value) next.add(store.id);
                        else next.delete(store.id);
                        return next;
                      })
                    }
                  />
                  <HealthDot status={store.healthStatus} />
                  <span aria-hidden>{countryFlag(store.countryCode)}</span>
                  <span className="min-w-0 flex-1 truncate">{store.name}</span>
                  {store.isDemo ? (
                    <Badge variant="info" size="sm">
                      Demo
                    </Badge>
                  ) : null}
                  {store.isPlanned ? (
                    <Badge variant="muted" size="sm">
                      Planned
                    </Badge>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          {plannedSelected.length > 0 ? (
            <WarningNote>
              {plannedSelected.length} selected store
              {plannedSelected.length === 1 ? ' is' : 's are'} still in the planned state with no BigCommerce
              store behind {plannedSelected.length === 1 ? 'it' : 'them'}. {plannedSelected.length === 1 ? 'It' : 'They'} will be skipped.
            </WarningNote>
          ) : null}

          {demoCount > 0 ? (
            <InfoNote>
              {demoCount} selected store{demoCount === 1 ? ' is a' : 's are'} demo connection
              {demoCount === 1 ? '' : 's'}. {demoCount === 1 ? 'It' : 'They'} will be recorded as already
              current — no BigCommerce store is contacted, and the seeded snapshots are left alone.
            </InfoNote>
          ) : null}
        </div>

        <DialogFooter>
          <div className="mr-auto text-xs text-muted-foreground">
            {jobTypes.size} job{jobTypes.size === 1 ? '' : 's'} × {liveCount} live store
            {liveCount === 1 ? '' : 's'}
          </div>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={jobTypes.size === 0 || storeIds.size === 0}>
            <Play className="h-4 w-4" aria-hidden />
            Start sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
