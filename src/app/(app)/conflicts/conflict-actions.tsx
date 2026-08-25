'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, GitCompareArrows, Play } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { InfoNote } from '@/components/shared/states';
import { resolveConflict, runComparison } from '@/app/actions/conflicts';
import { RESOLUTION_ACTION_LABELS, type ResolutionAction } from '@/lib/enums';
import { RESOURCE_CATEGORY_LIST } from '@/lib/resource-categories';
import { cn } from '@/lib/utils';

const ACTION_EXPLANATIONS: Record<ResolutionAction, string> = {
  KEEP_MASTER:
    'The master value should win. Writing to the store is not enabled in this release, so a dry-run is queued showing exactly what the write would change.',
  KEEP_LOCAL: 'The store’s value is correct. The conflict is closed and nothing is written anywhere.',
  COPY_MASTER_ONCE:
    'Copy the master value once, then let the two diverge again. Queued as a dry-run for the same reason as “Keep master”.',
  RE_ENABLE_INHERITANCE:
    'Retire the local override so this store follows its source again. This genuinely changes platform state.',
  ACCEPT_VARIANCE:
    'The difference is deliberate and should stop being reported as drift. Future scans will not reopen it.',
  EXCLUDE_FROM_COMPARISON: 'Stop comparing this resource for this store entirely.',
  MANUAL_REVIEW: 'Leave it open, flagged for someone to look at properly.',
};

export function ResolveConflictDialog({
  conflictId,
  resourceLabel,
  storeName,
  trigger,
}: {
  conflictId: string;
  resourceLabel: string;
  storeName: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ResolutionAction>('ACCEPT_VARIANCE');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await resolveConflict({ conflictId, action, note: note || undefined });
      if (!result.ok) {
        toast.error('Could not record the decision', { description: result.error });
        return;
      }
      toast.success('Decision recorded', { description: result.hint });
      setOpen(false);
      setNote('');
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Resolve
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Resolve this difference</DialogTitle>
          <DialogDescription>
            {resourceLabel} in {storeName}. Your decision is recorded in the audit log either way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(Object.keys(RESOLUTION_ACTION_LABELS) as ResolutionAction[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAction(value)}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                action === value ? 'border-primary bg-primary/[0.04]' : 'hover:border-primary/40',
              )}
              aria-pressed={action === value}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  action === value ? 'border-primary bg-primary' : 'border-input',
                )}
              >
                {action === value ? (
                  <Check className="h-2.5 w-2.5 text-primary-foreground" aria-hidden />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {RESOLUTION_ACTION_LABELS[value]}
                  {value === 'KEEP_MASTER' || value === 'COPY_MASTER_ONCE' ? (
                    <Badge variant="warning" size="sm">
                      Dry-run only
                    </Badge>
                  ) : null}
                  {value === 'RE_ENABLE_INHERITANCE' ? (
                    <Badge variant="info" size="sm">
                      Changes state
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                  {ACTION_EXPLANATIONS[value]}
                </span>
              </span>
            </button>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="resolution-note">Note (optional)</Label>
            <Textarea
              id="resolution-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why this decision was made, and who agreed it."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RunComparisonDialog({
  stores,
}: {
  stores: { id: string; name: string; isMaster: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sourceId, setSourceId] = useState(stores.find((store) => store.isMaster)?.id ?? stores[0]?.id ?? '');
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set(['PRODUCTS']));

  const comparableCategories = RESOURCE_CATEGORY_LIST.filter((meta) =>
    ['PRODUCTS', 'PRICING', 'THEMES', 'PAGES', 'CUSTOMER_GROUPS'].includes(meta.key),
  );

  const submit = () => {
    startTransition(async () => {
      const result = await runComparison({
        sourceConnectionId: sourceId,
        targetConnectionIds: [...targetIds],
        categories: [...categories],
      });
      if (!result.ok) {
        toast.error('Could not start the comparison', { description: result.error });
        return;
      }
      toast.success('Comparison queued', {
        description: 'Progress appears in the Sync Centre. Results land in this queue when it finishes.',
      });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <GitCompareArrows className="h-4 w-4" aria-hidden />
          Run a comparison
        </Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Compare stores</DialogTitle>
          <DialogDescription>
            Compares each target against the source and records the differences. Nothing is written to any
            store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="comparison-source">Source store</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="comparison-source">
                <SelectValue placeholder="Choose a source" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                    {store.isMaster ? ' (master)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Target stores</legend>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 thin-scrollbar sm:grid-cols-2">
              {stores
                .filter((store) => store.id !== sourceId)
                .map((store) => (
                  <label
                    key={store.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={targetIds.has(store.id)}
                      onCheckedChange={(value) =>
                        setTargetIds((current) => {
                          const next = new Set(current);
                          if (value) next.add(store.id);
                          else next.delete(store.id);
                          return next;
                        })
                      }
                    />
                    <span className="truncate">{store.name}</span>
                  </label>
                ))}
            </div>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                setTargetIds(new Set(stores.filter((store) => store.id !== sourceId).map((s) => s.id)))
              }
            >
              Select all
            </button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Resource categories</legend>
            <div className="grid gap-1 rounded-md border p-2 sm:grid-cols-2">
              {comparableCategories.map((meta) => (
                <label
                  key={meta.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={categories.has(meta.key)}
                    onCheckedChange={(value) =>
                      setCategories((current) => {
                        const next = new Set(current);
                        if (value) next.add(meta.key);
                        else next.delete(meta.key);
                        return next;
                      })
                    }
                  />
                  <span>{meta.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <InfoNote>
            A comparison is read-only. It builds product mappings by SKU, records differences as conflicts, and
            closes any conflict that no longer reproduces.
          </InfoNote>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={pending}
            disabled={targetIds.size === 0 || categories.size === 0 || !sourceId}
          >
            <Play className="h-4 w-4" aria-hidden />
            Run comparison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
