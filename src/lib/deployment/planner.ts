/**
 * Deployment planning and validation.
 *
 * Turns "copy these resources from this source to these targets" into a
 * concrete, inspectable plan: per-target item lists, capability verdicts,
 * validation errors and a blast-radius summary. Nothing here writes anywhere —
 * that is the whole point. Execution consumes the plan.
 *
 * Pure and dependency-free so the safety rules are unit-testable.
 */
import type {
  CapabilityStatus,
  ChangeType,
  DeploymentStrategy,
  RiskLevel,
} from '@/lib/enums';
import type { InheritanceMode } from '@/lib/enums';
import { modeAllowsWrite, modeRequiresApproval } from '@/lib/inheritance/resolver';
import type { ResourceCategory } from '@/lib/resource-categories';

export interface PlanTargetInput {
  connectionId: string;
  connectionName: string;
  channelId?: string | null;
  channelName?: string | null;
  /** Effective capability for the write this deployment needs. */
  capabilityStatus: CapabilityStatus;
  capabilityReason?: string | null;
  /** Inheritance mode governing this category for this store. */
  inheritanceMode: InheritanceMode;
  /** Store is a demo connection — execution is simulated. */
  isDemo: boolean;
  /** Store health; a critical store is excluded from execution. */
  isHealthy: boolean;
  /** Keys with a recorded local override in this store. */
  overriddenKeys: ReadonlySet<string>;
  currencyCode: string;
  countryCode: string;
}

export interface PlanResourceInput {
  key: string;
  label: string;
  resourceType: string;
  sourceValue: unknown;
  /** Present when the resource already exists in the target. */
  targetValueByConnection: ReadonlyMap<string, unknown>;
  /** True when applying this would remove data. */
  isDestructive?: boolean;
  /** Validation problems found before any target is considered. */
  validationErrors?: string[];
}

export interface PlanInput {
  resourceCategory: ResourceCategory;
  strategy: DeploymentStrategy;
  targets: PlanTargetInput[];
  resources: PlanResourceInput[];
  /** When false, an existing local override blocks the write for that key. */
  preserveLocalOverrides: boolean;
}

export interface PlannedItem {
  resourceKey: string;
  resourceLabel: string;
  resourceType: string;
  changeType: ChangeType;
  before: unknown;
  after: unknown;
  isDestructive: boolean;
  validationErrors: string[];
  message: string;
}

export interface PlannedTarget {
  connectionId: string;
  connectionName: string;
  channelId: string | null;
  channelName: string | null;
  /** Whether this target will actually be written to. */
  willExecute: boolean;
  /** Set when the target is excluded, explaining why. */
  exclusionReason: string | null;
  requiresManualAction: boolean;
  requiresApproval: boolean;
  isSimulated: boolean;
  hasLocalOverrides: boolean;
  items: PlannedItem[];
  counts: {
    create: number;
    update: number;
    delete: number;
    noChange: number;
    unsupported: number;
    manual: number;
    destructive: number;
    blocked: number;
  };
}

export interface BlastRadius {
  storeCount: number;
  channelCount: number;
  recordCount: number;
  createCount: number;
  updateCount: number;
  destructiveCount: number;
  unsupportedCount: number;
  storesWithLocalOverrides: number;
  storesRequiringManualAction: number;
  storesExcluded: number;
  currenciesAffected: string[];
  countriesAffected: string[];
  simulatedStoreCount: number;
  liveStoreCount: number;
}

export interface DeploymentPlan {
  resourceCategory: ResourceCategory;
  strategy: DeploymentStrategy;
  targets: PlannedTarget[];
  blastRadius: BlastRadius;
  riskLevel: RiskLevel;
  /** Blocking problems: the deployment cannot run until these are addressed. */
  errors: string[];
  /** Non-blocking things the operator must read before confirming. */
  warnings: string[];
  requiresTypedConfirmation: boolean;
  requiresApproval: boolean;
  /** The phrase the operator must type for a destructive deployment. */
  confirmationPhrase: string | null;
}

export function buildDeploymentPlan(input: PlanInput): DeploymentPlan {
  const targets = input.targets.map((target) => planTarget(target, input));

  const executing = targets.filter((target) => target.willExecute);
  const channelCount = new Set(
    executing.filter((target) => target.channelId).map((target) => target.channelId),
  ).size;

  const blastRadius: BlastRadius = {
    storeCount: executing.length,
    channelCount,
    recordCount: executing.reduce(
      (total, target) =>
        total + target.counts.create + target.counts.update + target.counts.delete,
      0,
    ),
    createCount: sumCount(executing, 'create'),
    updateCount: sumCount(executing, 'update'),
    destructiveCount: sumCount(executing, 'destructive'),
    unsupportedCount: sumCount(targets, 'unsupported'),
    storesWithLocalOverrides: targets.filter((target) => target.hasLocalOverrides).length,
    storesRequiringManualAction: targets.filter((target) => target.requiresManualAction).length,
    storesExcluded: targets.length - executing.length,
    currenciesAffected: unique(
      input.targets
        .filter((target) => executing.some((planned) => planned.connectionId === target.connectionId))
        .map((target) => target.currencyCode),
    ),
    countriesAffected: unique(
      input.targets
        .filter((target) => executing.some((planned) => planned.connectionId === target.connectionId))
        .map((target) => target.countryCode),
    ),
    simulatedStoreCount: executing.filter((target) => target.isSimulated).length,
    liveStoreCount: executing.filter((target) => !target.isSimulated).length,
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.resources.length === 0) {
    errors.push('No resources were selected, so there is nothing to deploy.');
  }
  if (input.targets.length === 0) {
    errors.push('No target stores were selected.');
  }
  if (executing.length === 0 && input.targets.length > 0) {
    errors.push(
      'Every selected store is excluded. Review the capability and health warnings on each target.',
    );
  }

  const validationFailures = targets.flatMap((target) =>
    target.items
      .filter((item) => item.validationErrors.length > 0)
      .map((item) => `${target.connectionName}: ${item.resourceLabel} — ${item.validationErrors[0]}`),
  );
  if (validationFailures.length > 0) {
    errors.push(...validationFailures.slice(0, 10));
    if (validationFailures.length > 10) {
      errors.push(`…and ${validationFailures.length - 10} further validation failures.`);
    }
  }

  for (const target of targets) {
    if (!target.willExecute && target.exclusionReason) {
      warnings.push(`${target.connectionName} will be skipped — ${target.exclusionReason}`);
    }
    if (target.hasLocalOverrides && target.willExecute && !input.preserveLocalOverrides) {
      warnings.push(
        `${target.connectionName} has local overrides that this deployment will replace.`,
      );
    }
    if (target.requiresManualAction) {
      warnings.push(
        `${target.connectionName} needs a manual step in the BigCommerce control panel to finish this change.`,
      );
    }
  }

  if (blastRadius.simulatedStoreCount > 0 && blastRadius.liveStoreCount > 0) {
    warnings.push(
      `This deployment mixes ${blastRadius.liveStoreCount} live store(s) with ${blastRadius.simulatedStoreCount} demo store(s). Only the live stores would be written to.`,
    );
  }
  if (blastRadius.currenciesAffected.length > 1 && input.resourceCategory === 'PRICING') {
    warnings.push(
      `Targets span ${blastRadius.currenciesAffected.join(', ')}. Prices are not converted between currencies — each target receives the source amount as-is.`,
    );
  }

  const requiresApproval = targets.some((target) => target.requiresApproval);
  const riskLevel = assessRisk(blastRadius, input.strategy);
  const requiresTypedConfirmation =
    blastRadius.destructiveCount > 0 ||
    input.strategy === 'OVERWRITE' ||
    riskLevel === 'CRITICAL' ||
    blastRadius.liveStoreCount >= 5;

  return {
    resourceCategory: input.resourceCategory,
    strategy: input.strategy,
    targets,
    blastRadius,
    riskLevel,
    errors,
    warnings,
    requiresApproval,
    requiresTypedConfirmation,
    confirmationPhrase: requiresTypedConfirmation
      ? buildConfirmationPhrase(blastRadius, input.resourceCategory)
      : null,
  };
}

function planTarget(target: PlanTargetInput, input: PlanInput): PlannedTarget {
  const items: PlannedItem[] = [];

  let exclusionReason: string | null = null;
  let requiresManualAction = false;

  // Capability gate — the platform never claims an operation it cannot perform.
  switch (target.capabilityStatus) {
    case 'AVAILABLE':
      break;
    case 'READ_ONLY':
      exclusionReason =
        target.capabilityReason ??
        'The API account can read this resource but not modify it in this store.';
      break;
    case 'PERMISSION_MISSING':
      exclusionReason =
        target.capabilityReason ?? 'The API account is missing the scope required for this write.';
      break;
    case 'PLAN_DEPENDENT':
      exclusionReason =
        target.capabilityReason ?? 'This store’s plan does not include the required capability.';
      break;
    case 'MANUAL_ACTION':
      requiresManualAction = true;
      exclusionReason =
        target.capabilityReason ??
        'This change cannot be automated and has been raised as a manual action instead.';
      break;
    case 'NOT_SUPPORTED':
      exclusionReason =
        target.capabilityReason ?? 'BigCommerce does not expose an API for this operation.';
      break;
    case 'NOT_IMPLEMENTED':
      exclusionReason =
        target.capabilityReason ??
        'The write path for this resource is not enabled in this release. The plan below shows what would change.';
      break;
  }

  if (!exclusionReason && !target.isHealthy) {
    exclusionReason = 'The store connection is unhealthy. Fix the connection before deploying to it.';
  }

  if (!exclusionReason && !modeAllowsWrite(target.inheritanceMode)) {
    exclusionReason =
      target.inheritanceMode === 'READ_ONLY_COMPARISON'
        ? 'This store is set to read-only comparison for this resource, so nothing will be written.'
        : 'This store does not inherit this resource, so it is excluded from source-driven deployments.';
  }

  for (const resource of input.resources) {
    const before = resource.targetValueByConnection.get(target.connectionId) ?? null;
    const exists = before !== null && before !== undefined;
    const isOverridden = target.overriddenKeys.has(resource.key);

    const validationErrors = [...(resource.validationErrors ?? [])];

    let changeType: ChangeType;
    let message: string;

    if (target.capabilityStatus === 'NOT_SUPPORTED') {
      changeType = 'UNSUPPORTED';
      message = exclusionReason ?? 'Not supported by the target store.';
    } else if (target.capabilityStatus === 'MANUAL_ACTION') {
      changeType = 'MANUAL';
      message = 'Recorded as a manual action with the intended value.';
    } else if (isOverridden && input.preserveLocalOverrides) {
      changeType = 'NO_CHANGE';
      message = 'Skipped — this store has a local override and overrides are being preserved.';
    } else if (!exists) {
      if (input.strategy === 'SYNC' || input.strategy === 'OVERWRITE' || input.strategy === 'COPY_ONCE' || input.strategy === 'ADDITIVE_ONLY') {
        changeType = 'CREATE';
        message = 'Will be created in the target store, producing a new store-local id.';
      } else {
        changeType = 'NO_CHANGE';
        message = 'Not present in the target and this strategy does not create records.';
      }
    } else if (input.strategy === 'ADDITIVE_ONLY') {
      changeType = 'NO_CHANGE';
      message = 'Already present. This strategy only adds missing records.';
    } else if (deepEqual(before, resource.sourceValue)) {
      changeType = 'NO_CHANGE';
      message = 'Already matches the source.';
    } else {
      changeType = 'UPDATE';
      message = isOverridden
        ? 'Will replace a local override.'
        : 'Will be updated to match the source.';
    }

    items.push({
      resourceKey: resource.key,
      resourceLabel: resource.label,
      resourceType: resource.resourceType,
      changeType,
      before,
      after: changeType === 'NO_CHANGE' ? before : resource.sourceValue,
      // No strategy in this planner emits DELETE; a resource can still declare
      // itself destructive (for example, replacing a theme with local edits).
      isDestructive:
        Boolean(resource.isDestructive) ||
        (changeType === 'UPDATE' && isOverridden && !input.preserveLocalOverrides),
      validationErrors,
      message,
    });
  }

  const counts = {
    create: items.filter((item) => item.changeType === 'CREATE').length,
    update: items.filter((item) => item.changeType === 'UPDATE').length,
    delete: items.filter((item) => item.changeType === 'DELETE').length,
    noChange: items.filter((item) => item.changeType === 'NO_CHANGE').length,
    unsupported: items.filter((item) => item.changeType === 'UNSUPPORTED').length,
    manual: items.filter((item) => item.changeType === 'MANUAL').length,
    destructive: items.filter((item) => item.isDestructive).length,
    blocked: items.filter((item) => item.validationErrors.length > 0).length,
  };

  const hasChanges = counts.create + counts.update + counts.delete > 0;

  return {
    connectionId: target.connectionId,
    connectionName: target.connectionName,
    channelId: target.channelId ?? null,
    channelName: target.channelName ?? null,
    willExecute: exclusionReason === null && hasChanges,
    exclusionReason:
      exclusionReason ?? (hasChanges ? null : 'Already in sync — no changes to apply.'),
    requiresManualAction,
    requiresApproval: modeRequiresApproval(target.inheritanceMode) && hasChanges,
    isSimulated: target.isDemo,
    hasLocalOverrides: target.overriddenKeys.size > 0,
    items,
    counts,
  };
}

function assessRisk(radius: BlastRadius, strategy: DeploymentStrategy): RiskLevel {
  if (radius.destructiveCount > 0 && radius.liveStoreCount > 0) return 'CRITICAL';
  if (strategy === 'OVERWRITE' && radius.liveStoreCount > 0) return 'HIGH';
  if (radius.liveStoreCount >= 5 || radius.recordCount >= 500) return 'HIGH';
  if (radius.liveStoreCount >= 2 || radius.recordCount >= 50) return 'MEDIUM';
  return 'LOW';
}

function buildConfirmationPhrase(radius: BlastRadius, category: ResourceCategory): string {
  return `deploy ${category.toLowerCase().replace(/_/g, ' ')} to ${radius.storeCount} store${radius.storeCount === 1 ? '' : 's'}`;
}

function sumCount(targets: PlannedTarget[], key: keyof PlannedTarget['counts']): number {
  return targets.reduce((total, target) => total + target.counts[key], 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * Validates that a typed confirmation matches. Comparison is case-insensitive
 * and whitespace-tolerant but otherwise exact — the operator must have read it.
 */
export function confirmationMatches(expected: string | null, provided: string): boolean {
  if (!expected) return true;
  return expected.trim().toLowerCase().replace(/\s+/g, ' ') ===
    provided.trim().toLowerCase().replace(/\s+/g, ' ');
}
