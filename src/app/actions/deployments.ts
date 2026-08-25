'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toAppError } from '@/lib/errors';
import { currentRequestIpHash, requireAuth } from '@/lib/auth/session';
import { requirePermission, scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { stringifyJson } from '@/lib/json';
import { DEPLOYMENT_STRATEGIES } from '@/lib/enums';
import { RESOURCE_CATEGORIES } from '@/lib/resource-categories';
import {
  buildDeploymentPlan,
  confirmationMatches,
  type PlanResourceInput,
  type PlanTargetInput,
} from '@/lib/deployment/planner';
import { effectiveMode, type PolicyRecord } from '@/lib/inheritance/resolver';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { jobQueue } from '@/server/jobs/runner';
import { registerAllJobHandlers } from '@/server/jobs/handlers';
import type { ActionResult } from './connections';

const WRITE_CAPABILITY_BY_CATEGORY: Record<string, string> = {
  PRODUCTS: 'products.update',
  PRICING: 'pricing.update',
  PRICE_LISTS: 'price_lists.manage',
  CATEGORIES: 'categories.manage',
  BRANDS: 'brands.manage',
  CUSTOMER_GROUPS: 'customer_groups.manage',
  PAGES: 'pages.manage',
  WIDGETS: 'widgets.manage',
  SCRIPTS: 'scripts.manage',
  REDIRECTS: 'redirects.manage',
  THEMES: 'themes.activate',
  THEME_CONFIGURATION: 'theme_config.manage',
  PROMOTIONS: 'promotions.manage',
  INVENTORY_SETTINGS: 'inventory.update',
  STORE_SETTINGS: 'storefront_settings.manage',
  CHECKOUT_SETTINGS: 'checkout_settings.manage',
  SHIPPING_CONFIGURATION: 'shipping.manage',
  TAX_CONFIGURATION: 'tax.manage',
  CURRENCY_CONFIGURATION: 'currencies.manage',
  LOCALE_CONFIGURATION: 'locales.manage',
  EMAIL_TEMPLATES: 'email_templates.manage',
  BANNERS: 'banners.manage',
  NAVIGATION: 'navigation.manage',
  SEO_DEFAULTS: 'storefront_settings.manage',
};

const planSchema = z.object({
  name: z.string().min(3, 'Give the deployment a name.').max(140),
  description: z.string().max(2000).optional(),
  resourceCategory: z.enum(RESOURCE_CATEGORIES),
  strategy: z.enum(DEPLOYMENT_STRATEGIES),
  sourceConnectionId: z.string().min(1, 'Choose a source store.'),
  targetConnectionIds: z.array(z.string()).min(1, 'Choose at least one target store.'),
  resourceKeys: z.array(z.string()).default([]),
  preserveLocalOverrides: z.boolean().default(true),
});

export type PlanDeploymentInput = z.infer<typeof planSchema>;

/**
 * Builds a dry-run plan and persists it as a DRAFT deployment.
 *
 * Nothing is written to any store: this produces the change plan, the blast
 * radius, the capability verdict per target and the validation errors. The
 * operator confirms afterwards.
 */
export async function createDryRun(
  input: PlanDeploymentInput,
): Promise<ActionResult<{ deploymentId: string }>> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'deployment:create');
    const scope = scopeFromAuth(auth);

    const parsed = planSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input.',
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      };
    }
    const values = parsed.data;

    const source = await prisma.storeConnection.findFirst({
      where: { id: values.sourceConnectionId, organisationId: scope.organisationId, deletedAt: null },
      select: { id: true, name: true, companyId: true, currencyCode: true },
    });
    if (!source) return { ok: false, error: 'The source store is not available in this organisation.' };

    const targets = await prisma.storeConnection.findMany({
      where: {
        id: { in: values.targetConnectionIds },
        organisationId: scope.organisationId,
        deletedAt: null,
      },
      include: {
        capabilities: { select: { capabilityKey: true, status: true, unavailableReason: true } },
        overrides: {
          where: { status: 'ACTIVE', resourceCategory: values.resourceCategory },
          select: { resourceKey: true },
        },
        groupMemberships: { select: { storeGroupId: true } },
      },
    });

    if (targets.length === 0) {
      return { ok: false, error: 'None of the selected targets are available in this organisation.' };
    }

    // Inheritance policies that could govern this category.
    const policies = await prisma.inheritancePolicy.findMany({
      where: { organisationId: scope.organisationId, resourceCategory: values.resourceCategory },
    });
    const policyRecords: PolicyRecord[] = policies.map((policy) => ({
      scopeType: policy.scopeType as PolicyRecord['scopeType'],
      scopeId: policy.scopeId,
      resourceCategory: policy.resourceCategory,
      mode: policy.mode as PolicyRecord['mode'],
      sourceType: policy.sourceType,
      sourceId: policy.sourceId,
      isActive: policy.isActive,
    }));

    const capabilityKey = WRITE_CAPABILITY_BY_CATEGORY[values.resourceCategory];

    const planTargets: PlanTargetInput[] = targets.map((target) => {
      const capability = target.capabilities.find((entry) => entry.capabilityKey === capabilityKey);
      const { mode } = effectiveMode(policyRecords, values.resourceCategory, {
        organisationId: scope.organisationId,
        companyId: target.companyId,
        regionId: target.regionId,
        storeGroupIds: target.groupMemberships.map((membership) => membership.storeGroupId),
        storeId: target.id,
      });

      return {
        connectionId: target.id,
        connectionName: target.name,
        capabilityStatus: (capability?.status ?? 'NOT_IMPLEMENTED') as PlanTargetInput['capabilityStatus'],
        capabilityReason: capability?.unavailableReason ?? null,
        inheritanceMode: mode,
        isDemo: target.isDemo,
        isHealthy: target.healthStatus !== 'CRITICAL',
        overriddenKeys: new Set(target.overrides.map((override) => override.resourceKey)),
        currencyCode: target.currencyCode,
        countryCode: target.countryCode,
      };
    });

    // Resources: either the explicit selection or the whole source catalogue.
    const sourceProducts = await prisma.productSnapshot.findMany({
      where: {
        connectionId: source.id,
        ...(values.resourceKeys.length > 0 ? { sku: { in: values.resourceKeys } } : {}),
      },
      select: { sku: true, name: true, price: true, salePrice: true, isVisible: true, currencyCode: true },
      take: 500,
    });

    const targetProducts = await prisma.productSnapshot.findMany({
      where: { connectionId: { in: targets.map((target) => target.id) } },
      select: { connectionId: true, sku: true, price: true, isVisible: true, currencyCode: true },
    });

    const resources: PlanResourceInput[] = sourceProducts.map((product) => {
      const targetValueByConnection = new Map<string, unknown>();
      for (const target of targets) {
        const existing = targetProducts.find(
          (entry) => entry.connectionId === target.id && entry.sku === product.sku,
        );
        if (existing) {
          targetValueByConnection.set(target.id, {
            price: existing.price,
            isVisible: existing.isVisible,
            currencyCode: existing.currencyCode,
          });
        }
      }

      // Validation: refuse to move a price into a different currency blindly.
      const validationErrors: string[] = [];
      if (values.resourceCategory === 'PRICING') {
        const mismatched = targets.filter((target) => target.currencyCode !== source.currencyCode);
        if (mismatched.length > 0 && values.strategy === 'OVERWRITE') {
          validationErrors.push(
            `Source is priced in ${source.currencyCode} but ${mismatched.length} target(s) trade in a different currency. An overwrite would set the source number as a literal amount in the target currency.`,
          );
        }
      }

      return {
        key: product.sku,
        label: product.name,
        resourceType: values.resourceCategory === 'PRICING' ? 'price' : 'product',
        sourceValue: {
          price: product.price,
          isVisible: product.isVisible,
          currencyCode: product.currencyCode,
        },
        targetValueByConnection,
        validationErrors,
      };
    });

    const plan = buildDeploymentPlan({
      resourceCategory: values.resourceCategory,
      strategy: values.strategy,
      targets: planTargets,
      resources,
      preserveLocalOverrides: values.preserveLocalOverrides,
    });

    // Persist the plan so it can be reviewed, approved and executed later.
    const deployment = await prisma.deployment.create({
      data: {
        organisationId: scope.organisationId,
        companyId: source.companyId,
        name: values.name,
        description: values.description || null,
        resourceCategory: values.resourceCategory,
        status: plan.requiresApproval ? 'AWAITING_APPROVAL' : 'DRAFT',
        strategy: values.strategy,
        riskLevel: plan.riskLevel,
        sourceConnectionId: source.id,
        createdByUserId: auth.user.id,
        requiresApproval: plan.requiresApproval,
        preserveLocalOverrides: values.preserveLocalOverrides,
        dryRunAt: new Date(),
        blastRadiusJson: stringifyJson(plan.blastRadius),
        dryRunSummaryJson: stringifyJson({
          calculatedAt: new Date().toISOString(),
          errors: plan.errors,
          warnings: plan.warnings,
          requiresTypedConfirmation: plan.requiresTypedConfirmation,
          confirmationPhrase: plan.confirmationPhrase,
        }),
        targets: {
          create: plan.targets.map((target) => ({
            connectionId: target.connectionId,
            status: target.willExecute ? 'PENDING' : 'BLOCKED',
            plannedCount: target.counts.create + target.counts.update,
            hasLocalOverrides: target.hasLocalOverrides,
            requiresManualAction: target.requiresManualAction,
            unsupportedReason: target.exclusionReason,
          })),
        },
      },
      include: { targets: true },
    });

    // Item rows, keyed to the persisted targets.
    for (const plannedTarget of plan.targets) {
      const persisted = deployment.targets.find(
        (target) => target.connectionId === plannedTarget.connectionId,
      );
      if (!persisted) continue;

      // Only persist items that actually mean something, to keep the plan readable.
      const meaningful = plannedTarget.items.filter((item) => item.changeType !== 'NO_CHANGE').slice(0, 200);

      if (meaningful.length === 0) continue;

      await prisma.deploymentItem.createMany({
        data: meaningful.map((item) => ({
          deploymentId: deployment.id,
          targetId: persisted.id,
          resourceType: item.resourceType,
          resourceKey: item.resourceKey,
          resourceLabel: item.resourceLabel,
          changeType: item.changeType,
          status: 'PLANNED',
          beforeJson: stringifyJson(item.before),
          afterJson: stringifyJson(item.after),
          validationJson: item.validationErrors.length > 0 ? stringifyJson(item.validationErrors) : null,
          isDestructive: item.isDestructive,
          message: item.message,
        })),
      });
    }

    if (plan.requiresApproval) {
      const approval = await prisma.approvalRequest.create({
        data: {
          organisationId: scope.organisationId,
          subjectType: 'DEPLOYMENT',
          subjectId: deployment.id,
          title: values.name,
          reason: 'The inheritance policy for this resource requires approval before changes apply.',
          changeSummary: `${plan.blastRadius.recordCount} record(s) across ${plan.blastRadius.storeCount} store(s).`,
          targetScope: plan.targets.map((target) => target.connectionName).join(', '),
          riskLevel: plan.riskLevel,
          requesterId: auth.user.id,
        },
      });
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { approvalRequestId: approval.id },
      });
    }

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.DEPLOYMENT_DRY_RUN,
      resourceType: 'deployment',
      resourceId: deployment.id,
      resourceLabel: values.name,
      companyId: source.companyId,
      outcome: 'DRY_RUN',
      after: {
        category: values.resourceCategory,
        strategy: values.strategy,
        storeCount: plan.blastRadius.storeCount,
        recordCount: plan.blastRadius.recordCount,
        destructiveCount: plan.blastRadius.destructiveCount,
        riskLevel: plan.riskLevel,
      },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/deployments');
    return { ok: true, data: { deploymentId: deployment.id } };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

const executeSchema = z.object({
  deploymentId: z.string().min(1),
  confirmation: z.string().default(''),
});

export async function executeDeployment(
  input: z.infer<typeof executeSchema>,
): Promise<ActionResult<{ jobId: string }>> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'deployment:execute');
    const scope = scopeFromAuth(auth);

    const parsed = executeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid input.' };

    const deployment = await prisma.deployment.findFirst({
      where: { id: parsed.data.deploymentId, organisationId: scope.organisationId },
      include: { targets: true },
    });
    if (!deployment) return { ok: false, error: 'That deployment could not be found.' };

    if (deployment.status === 'AWAITING_APPROVAL') {
      return {
        ok: false,
        error: 'This deployment is awaiting approval and cannot be executed yet.',
        hint: 'Approve it first, or change the inheritance policy that requires approval.',
      };
    }

    if (!['DRAFT', 'APPROVED', 'FAILED', 'PARTIAL'].includes(deployment.status)) {
      return { ok: false, error: `A deployment in the ${deployment.status} state cannot be executed.` };
    }

    const summary = deployment.dryRunSummaryJson
      ? (JSON.parse(deployment.dryRunSummaryJson) as {
          requiresTypedConfirmation?: boolean;
          confirmationPhrase?: string | null;
          errors?: string[];
        })
      : {};

    if ((summary.errors ?? []).length > 0) {
      return {
        ok: false,
        error: 'This deployment has blocking validation errors and cannot be executed.',
        hint: summary.errors![0],
      };
    }

    if (summary.requiresTypedConfirmation) {
      if (!confirmationMatches(summary.confirmationPhrase ?? null, parsed.data.confirmation)) {
        return {
          ok: false,
          error: `Type the confirmation phrase exactly to proceed: “${summary.confirmationPhrase}”.`,
        };
      }
    }

    registerAllJobHandlers();
    const { jobId } = await jobQueue.enqueue({
      organisationId: scope.organisationId,
      companyId: deployment.companyId,
      jobType: jobTypeForCategory(deployment.resourceCategory),
      resourceCategory: deployment.resourceCategory,
      initiatedByUserId: auth.user.id,
      deploymentId: deployment.id,
      sourceConnectionId: deployment.sourceConnectionId,
      parameters: { deploymentId: deployment.id },
      targets: deployment.targets.map((target) => ({ connectionId: target.connectionId })),
    });

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'QUEUED' },
    });

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.DEPLOYMENT_EXECUTED,
      resourceType: 'deployment',
      resourceId: deployment.id,
      resourceLabel: deployment.name,
      companyId: deployment.companyId,
      after: { jobId, targets: deployment.targets.length },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/deployments');
    revalidatePath(`/deployments/${deployment.id}`);
    return { ok: true, data: { jobId } };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

const decideSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().max(1000).optional(),
});

export async function decideApproval(input: z.infer<typeof decideSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    const scope = scopeFromAuth(auth);

    const parsed = decideSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid input.' };

    const approval = await prisma.approvalRequest.findFirst({
      where: { id: parsed.data.approvalId, organisationId: scope.organisationId, status: 'PENDING' },
    });
    if (!approval) return { ok: false, error: 'That approval request is no longer pending.' };

    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: parsed.data.decision,
        approverId: auth.user.id,
        decisionComment: parsed.data.comment || null,
        decidedAt: new Date(),
      },
    });

    if (approval.subjectType === 'DEPLOYMENT') {
      await prisma.deployment.updateMany({
        where: { id: approval.subjectId },
        data: { status: parsed.data.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
      });
    }

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.APPROVAL_DECIDED,
      resourceType: 'approval',
      resourceId: approval.id,
      resourceLabel: approval.title,
      before: { status: 'PENDING' },
      after: { status: parsed.data.decision, comment: parsed.data.comment ? 'provided' : 'none' },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/deployments');
    return { ok: true };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}

function jobTypeForCategory(category: string) {
  switch (category) {
    case 'PRICING':
    case 'PRICE_LISTS':
      return 'PRICING_DEPLOYMENT' as const;
    case 'INVENTORY_SETTINGS':
      return 'INVENTORY_DEPLOYMENT' as const;
    case 'PAGES':
    case 'WIDGETS':
    case 'SCRIPTS':
    case 'REDIRECTS':
    case 'BANNERS':
      return 'CONTENT_DEPLOYMENT' as const;
    case 'THEMES':
    case 'THEME_CONFIGURATION':
      return 'THEME_DEPLOYMENT' as const;
    case 'CUSTOMER_GROUPS':
      return 'CUSTOMER_GROUP_DEPLOYMENT' as const;
    default:
      return 'CATALOG_DEPLOYMENT' as const;
  }
}

/** Store options for the deployment builder, scoped to the tenant. */
export async function loadDeploymentTargets() {
  const auth = await requireAuth();
  const scope = scopeFromAuth(auth);
  return prisma.storeConnection.findMany({
    where: { ...tenantWhere(scope), deletedAt: null },
    orderBy: [{ hierarchyMode: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      currencyCode: true,
      countryCode: true,
      healthStatus: true,
      hierarchyMode: true,
      isDemo: true,
    },
  });
}
