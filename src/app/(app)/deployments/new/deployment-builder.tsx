'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, ClipboardCheck, Play } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { HealthDot } from '@/components/shared/status-badges';
import { createDryRun } from '@/app/actions/deployments';
import { DEPLOYMENT_STRATEGIES, type DeploymentStrategy } from '@/lib/enums';
import { RESOURCE_CATEGORY_LIST, type ResourceCategory } from '@/lib/resource-categories';
import { countryFlag } from '@/lib/utils';

interface StoreOption {
  id: string;
  name: string;
  currencyCode: string;
  countryCode: string;
  healthStatus: string;
  hierarchyMode: string;
  isDemo: boolean;
}

const STRATEGY_DESCRIPTIONS: Record<DeploymentStrategy, string> = {
  COPY_ONCE:
    'Seed the target with the source value, then let the two diverge. Existing values are updated; missing records are created.',
  SYNC: 'Keep the target aligned with the source. Existing values are updated and missing records are created.',
  OVERWRITE:
    'Replace the target value regardless of local changes. This is the only strategy that can discard a deliberate local decision.',
  ADDITIVE_ONLY: 'Only create records that are missing. Nothing that already exists is touched.',
};

export function DeploymentBuilder({
  stores,
  initialTargets,
  initialCategory,
  initialSkus,
}: {
  stores: StoreOption[];
  initialTargets: string[];
  initialCategory?: string;
  initialSkus: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const defaultSource =
    stores.find((store) => store.hierarchyMode === 'MASTER')?.id ?? stores[0]?.id ?? '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ResourceCategory>(
    (initialCategory as ResourceCategory) ?? 'PRODUCTS',
  );
  const [strategy, setStrategy] = useState<DeploymentStrategy>('COPY_ONCE');
  const [sourceId, setSourceId] = useState(defaultSource);
  const [targetIds, setTargetIds] = useState<Set<string>>(
    new Set(initialTargets.filter((id) => id !== defaultSource)),
  );
  const [preserveOverrides, setPreserveOverrides] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categoryMeta = RESOURCE_CATEGORY_LIST.find((meta) => meta.key === category);
  const selectedTargets = stores.filter((store) => targetIds.has(store.id));
  const sourceStore = stores.find((store) => store.id === sourceId);

  const currencyMismatch =
    sourceStore && selectedTargets.some((target) => target.currencyCode !== sourceStore.currencyCode);
  const liveTargets = selectedTargets.filter((target) => !target.isDemo).length;

  const submit = () => {
    startTransition(async () => {
      setError(null);
      const result = await createDryRun({
        name: name.trim() || `${categoryMeta?.label ?? category} from ${sourceStore?.name ?? 'source'}`,
        description: description || undefined,
        resourceCategory: category,
        strategy,
        sourceConnectionId: sourceId,
        targetConnectionIds: [...targetIds],
        resourceKeys: initialSkus,
        preserveLocalOverrides: preserveOverrides,
      });

      if (!result.ok) {
        setError(result.error ?? 'The dry-run could not be created.');
        toast.error('Could not create the dry-run', { description: result.error });
        return;
      }

      toast.success('Dry-run complete', {
        description: 'Review the plan and blast radius before confirming anything.',
      });
      router.push(`/deployments/${result.data!.deploymentId}`);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {error ? <WarningNote>{error}</WarningNote> : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What are you deploying?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="deployment-name">Name</Label>
              <Input
                id="deployment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Peak season catalogue alignment"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="deployment-description">Description</Label>
              <Textarea
                id="deployment-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Why this change is being made, and who asked for it."
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="deployment-category">Resource category</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as ResourceCategory)}>
                  <SelectTrigger id="deployment-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {RESOURCE_CATEGORY_LIST.map((meta) => (
                      <SelectItem key={meta.key} value={meta.key}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoryMeta ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">{categoryMeta.note}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deployment-strategy">Strategy</Label>
                <Select
                  value={strategy}
                  onValueChange={(value) => setStrategy(value as DeploymentStrategy)}
                >
                  <SelectTrigger id="deployment-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPLOYMENT_STRATEGIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'COPY_ONCE'
                          ? 'Copy once'
                          : value === 'SYNC'
                            ? 'Keep in sync'
                            : value === 'OVERWRITE'
                              ? 'Overwrite'
                              : 'Additive only'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {STRATEGY_DESCRIPTIONS[strategy]}
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border p-3">
              <Checkbox
                checked={preserveOverrides}
                onCheckedChange={(value) => setPreserveOverrides(Boolean(value))}
              />
              <span>
                <span className="block text-sm font-medium">Preserve local overrides</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  Skip any record where the target store has recorded a deliberate local value. Turning this off
                  makes the deployment destructive and requires a typed confirmation.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Source and targets</CardTitle>
            <CardDescription>Values flow from the source into every selected target.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="deployment-source">Source store</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger id="deployment-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name} · {store.currencyCode}
                      {store.hierarchyMode === 'MASTER' ? ' (master)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Target stores</legend>
              <div className="grid gap-1 rounded-md border p-2 sm:grid-cols-2">
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
                      <HealthDot status={store.healthStatus} />
                      <span aria-hidden>{countryFlag(store.countryCode)}</span>
                      <span className="min-w-0 flex-1 truncate">{store.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{store.currencyCode}</span>
                    </label>
                  ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setTargetIds(new Set(stores.filter((store) => store.id !== sourceId).map((s) => s.id)))
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setTargetIds(new Set())}
                >
                  Clear
                </button>
              </div>
            </fieldset>

            {initialSkus.length > 0 ? (
              <InfoNote>
                Scoped to {initialSkus.length} selected SKU{initialSkus.length === 1 ? '' : 's'}:{' '}
                <span className="font-mono text-xs">{initialSkus.slice(0, 5).join(', ')}</span>
                {initialSkus.length > 5 ? ` and ${initialSkus.length - 5} more.` : '.'}
              </InfoNote>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Live preview panel */}
      <div className="space-y-4">
        <Card className="lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <ClipboardCheck className="h-4 w-4" aria-hidden />
              Before you dry-run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4 border-b py-1">
                <dt className="text-muted-foreground">Targets</dt>
                <dd className="font-medium">{selectedTargets.length}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b py-1">
                <dt className="text-muted-foreground">Live stores</dt>
                <dd className="font-medium">{liveTargets}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b py-1">
                <dt className="text-muted-foreground">Demo stores</dt>
                <dd className="font-medium">{selectedTargets.length - liveTargets}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b py-1">
                <dt className="text-muted-foreground">Currencies</dt>
                <dd className="font-medium">
                  {[...new Set(selectedTargets.map((target) => target.currencyCode))].join(', ') || '—'}
                </dd>
              </div>
            </dl>

            {currencyMismatch ? (
              <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/[0.06] p-2.5 text-xs leading-relaxed">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  Targets trade in a different currency from the source. Amounts are copied literally — nothing
                  is converted.
                </span>
              </div>
            ) : null}

            {!preserveOverrides ? (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/[0.05] p-2.5 text-xs leading-relaxed">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                <span>
                  Local overrides will be replaced. This makes the deployment destructive and will require a
                  typed confirmation before it can run.
                </span>
              </div>
            ) : null}

            {categoryMeta && categoryMeta.automation !== 'AUTOMATED' ? (
              <div className="flex gap-2 rounded-md border bg-muted/50 p-2.5 text-xs leading-relaxed">
                <Badge variant="muted" size="sm">
                  {categoryMeta.automation === 'UNSUPPORTED' ? 'No public API' : 'Partial automation'}
                </Badge>
                <span className="text-muted-foreground">
                  Some targets will be reported as manual actions rather than automated changes.
                </span>
              </div>
            ) : null}

            <Button
              className="w-full"
              onClick={submit}
              loading={pending}
              disabled={targetIds.size === 0 || !sourceId}
            >
              <Play className="h-4 w-4" aria-hidden />
              Run dry-run
            </Button>

            <p className="text-xs leading-relaxed text-muted-foreground">
              A dry-run never writes anything. It calculates the differences, checks each target&rsquo;s
              capability and inheritance mode, validates the data and produces the blast radius for review.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
