'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { AppError, toAppError } from '@/lib/errors';
import { currentRequestIpHash, requireAuth } from '@/lib/auth/session';
import { assertTenantAccess, requirePermission, scopeFromAuth } from '@/lib/tenancy';
import { slugify } from '@/lib/utils';
import { CONNECTION_TYPES, HIERARCHY_MODES, STORE_CLASSIFICATIONS } from '@/lib/enums';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { storeCredential } from '@/server/services/credentials';
import {
  disconnectStore,
  testStoreConnection,
  verifyStoreCapabilities,
} from '@/server/services/connections';
import { jobQueue } from '@/server/jobs/runner';
import { registerAllJobHandlers } from '@/server/jobs/handlers';

const createConnectionSchema = z.object({
  name: z.string().min(2, 'Give the store a name of at least two characters.').max(120),
  storeHash: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{5,20}$/i, 'A BigCommerce store hash is 5–20 letters and digits.')
    .optional()
    .or(z.literal('')),
  accessToken: z.string().trim().optional().or(z.literal('')),
  clientId: z.string().trim().optional().or(z.literal('')),
  clientSecret: z.string().trim().optional().or(z.literal('')),
  companyId: z.string().min(1, 'Choose a company.'),
  regionId: z.string().optional().or(z.literal('')),
  brandId: z.string().optional().or(z.literal('')),
  environmentId: z.string().optional().or(z.literal('')),
  connectionType: z.enum(CONNECTION_TYPES),
  hierarchyMode: z.enum(HIERARCHY_MODES),
  classification: z.enum(STORE_CLASSIFICATIONS),
  masterConnectionId: z.string().optional().or(z.literal('')),
  templateId: z.string().optional().or(z.literal('')),
  countryCode: z.string().length(2, 'Use a two-letter country code.'),
  currencyCode: z.string().length(3, 'Use a three-letter currency code.'),
  locale: z.string().min(2).max(10),
  notes: z.string().max(2000).optional().or(z.literal('')),
  /** When true the connection is seeded as demo and never calls out. */
  isDemo: z.boolean().default(false),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  hint?: string;
  data?: T;
}

export async function createConnection(
  input: CreateConnectionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'store:write');
    const scope = scopeFromAuth(auth);

    const parsed = createConnectionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Some fields need attention.',
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      };
    }
    const values = parsed.data;

    // A real connection needs a hash and a token; a demo one needs neither.
    if (!values.isDemo) {
      if (!values.storeHash) {
        return { ok: false, error: 'A store hash is required for a live connection.', fieldErrors: { storeHash: 'Required for a live connection.' } };
      }
      if (!values.accessToken) {
        return {
          ok: false,
          error: 'An API account token is required for a live connection.',
          fieldErrors: { accessToken: 'Required for a live connection.' },
        };
      }
    }

    const company = await prisma.company.findFirst({
      where: { id: values.companyId, organisationId: scope.organisationId, deletedAt: null },
    });
    assertTenantAccess(company, scope, 'company');

    // Slug must be unique within the organisation.
    const baseSlug = slugify(values.name);
    let slug = baseSlug;
    for (let suffix = 2; suffix < 50; suffix += 1) {
      const clash = await prisma.storeConnection.findFirst({
        where: { organisationId: scope.organisationId, slug },
        select: { id: true },
      });
      if (!clash) break;
      slug = `${baseSlug}-${suffix}`;
    }

    const connection = await prisma.storeConnection.create({
      data: {
        organisationId: scope.organisationId,
        companyId: values.companyId,
        regionId: values.regionId || null,
        brandId: values.brandId || null,
        environmentId: values.environmentId || null,
        name: values.name,
        slug,
        storeHash: values.storeHash || null,
        connectionType: values.connectionType,
        hierarchyMode: values.hierarchyMode,
        classification: values.classification,
        masterConnectionId: values.masterConnectionId || null,
        templateId: values.templateId || null,
        status: values.storeHash ? 'CONNECTING' : 'PLANNED',
        healthStatus: 'UNKNOWN',
        healthMessage: values.storeHash
          ? 'Created. Run a connection test to verify the credential and capabilities.'
          : 'Planned. Connect the store once it has been provisioned by BigCommerce.',
        isDemo: values.isDemo,
        countryCode: values.countryCode.toUpperCase(),
        currencyCode: values.currencyCode.toUpperCase(),
        locale: values.locale,
        notes: values.notes || null,
        connectedAt: values.storeHash ? new Date() : null,
        controlPanelUrl: values.storeHash
          ? `https://store-${values.storeHash}.mybigcommerce.com/manage`
          : null,
      },
    });

    // Secrets are written through the credential service, never inline.
    if (values.accessToken) {
      await storeCredential({
        organisationId: scope.organisationId,
        connectionId: connection.id,
        credentialType: 'API_ACCOUNT_TOKEN',
        label: `${values.name} — API account`,
        plaintext: values.accessToken,
        createdByUserId: auth.user.id,
      });
    }
    if (values.clientId) {
      await storeCredential({
        organisationId: scope.organisationId,
        connectionId: connection.id,
        credentialType: 'CLIENT_ID',
        label: `${values.name} — client id`,
        plaintext: values.clientId,
        createdByUserId: auth.user.id,
      });
    }
    if (values.clientSecret) {
      await storeCredential({
        organisationId: scope.organisationId,
        connectionId: connection.id,
        credentialType: 'CLIENT_SECRET',
        label: `${values.name} — client secret`,
        plaintext: values.clientSecret,
        createdByUserId: auth.user.id,
      });
    }

    if (values.masterConnectionId) {
      await prisma.storeRelationship.create({
        data: {
          organisationId: scope.organisationId,
          parentId: values.masterConnectionId,
          childId: connection.id,
          relationshipType: 'MASTER_CHILD',
          notes: 'Established during the connection wizard.',
        },
      });
    }

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.CONNECTION_CREATED,
      resourceType: 'connection',
      resourceId: connection.id,
      resourceLabel: connection.name,
      companyId: values.companyId,
      connectionId: connection.id,
      // Note: no secret is included — only whether one was supplied.
      after: {
        connectionType: values.connectionType,
        hierarchyMode: values.hierarchyMode,
        storeHash: values.storeHash ? 'provided' : 'absent',
        credentialSupplied: Boolean(values.accessToken),
        isDemo: values.isDemo,
      },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/stores');
    return { ok: true, data: { id: connection.id } };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

export async function testConnection(connectionId: string): Promise<
  ActionResult<{
    latencyMs?: number;
    grantedScopes?: string[];
    missingScopes?: string[];
    isSimulated?: boolean;
    message: string;
  }>
> {
  try {
    const auth = await requireAuth();
    const scope = scopeFromAuth(auth);

    const connection = await prisma.storeConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, organisationId: true, companyId: true, name: true },
    });
    assertTenantAccess(connection, scope, 'store');

    const result = await testStoreConnection(connectionId);

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.CONNECTION_TESTED,
      resourceType: 'connection',
      resourceId: connectionId,
      resourceLabel: connection!.name,
      companyId: connection!.companyId,
      connectionId,
      outcome: result.ok ? 'SUCCESS' : 'FAILURE',
      errorSummary: result.ok ? null : result.message,
      after: { ok: result.ok, latencyMs: result.latencyMs },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath(`/stores/${connectionId}`);
    return {
      ok: result.ok,
      error: result.ok ? undefined : result.message,
      data: {
        latencyMs: result.latencyMs,
        grantedScopes: result.grantedScopes,
        missingScopes: result.missingScopes,
        isSimulated: result.isSimulated,
        message: result.message,
      },
    };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

export async function verifyCapabilities(connectionId: string): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    const scope = scopeFromAuth(auth);

    const connection = await prisma.storeConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, organisationId: true, name: true, companyId: true },
    });
    assertTenantAccess(connection, scope, 'store');

    const result = await verifyStoreCapabilities(connectionId);

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.CAPABILITIES_VERIFIED,
      resourceType: 'connection',
      resourceId: connectionId,
      resourceLabel: connection!.name,
      connectionId,
      companyId: connection!.companyId,
      outcome: result.ok ? 'SUCCESS' : 'FAILURE',
      after: { message: result.message },
    });

    revalidatePath(`/stores/${connectionId}`);
    return { ok: result.ok, error: result.ok ? undefined : result.message };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}

export async function discoverChannels(connectionId: string): Promise<ActionResult<{ jobId: string }>> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'store:write');
    const scope = scopeFromAuth(auth);

    const connection = await prisma.storeConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, organisationId: true, companyId: true, name: true },
    });
    assertTenantAccess(connection, scope, 'store');

    registerAllJobHandlers();
    const { jobId } = await jobQueue.enqueue({
      organisationId: scope.organisationId,
      companyId: connection!.companyId,
      jobType: 'CHANNEL_DISCOVERY',
      initiatedByUserId: auth.user.id,
      targets: [{ connectionId }],
    });

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.JOB_ENQUEUED,
      resourceType: 'job',
      resourceId: jobId,
      resourceLabel: `Channel discovery — ${connection!.name}`,
      connectionId,
    });

    revalidatePath('/sync');
    return { ok: true, data: { jobId } };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}

const rotateSchema = z.object({
  connectionId: z.string().min(1),
  accessToken: z.string().trim().min(10, 'That does not look like a BigCommerce access token.'),
});

export async function rotateCredential(input: z.infer<typeof rotateSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'credential:write');
    const scope = scopeFromAuth(auth);

    const parsed = rotateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input.',
        fieldErrors: { accessToken: parsed.error.issues[0]?.message ?? '' },
      };
    }

    const connection = await prisma.storeConnection.findUnique({
      where: { id: parsed.data.connectionId },
      select: { id: true, organisationId: true, name: true, companyId: true, isDemo: true },
    });
    assertTenantAccess(connection, scope, 'store');

    if (connection!.isDemo) {
      throw new AppError(
        'DEMO_MODE_BLOCKED',
        'This is a demo connection, so it holds no real credential to rotate.',
        { hint: 'Create a live connection to exercise credential rotation.' },
      );
    }

    await storeCredential({
      organisationId: scope.organisationId,
      connectionId: parsed.data.connectionId,
      credentialType: 'API_ACCOUNT_TOKEN',
      label: `${connection!.name} — API account`,
      plaintext: parsed.data.accessToken,
      createdByUserId: auth.user.id,
    });

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.CREDENTIAL_ROTATED,
      resourceType: 'credential',
      resourceId: parsed.data.connectionId,
      resourceLabel: `${connection!.name} — API account`,
      connectionId: parsed.data.connectionId,
      companyId: connection!.companyId,
      after: { rotated: true },
      ipHash: await currentRequestIpHash(),
    });

    // Immediately re-test, so the operator finds out now rather than later.
    await testStoreConnection(parsed.data.connectionId);

    revalidatePath(`/stores/${parsed.data.connectionId}`);
    return { ok: true };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message, hint: appError.hint };
  }
}

export async function disconnect(connectionId: string, confirmation: string): Promise<ActionResult> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'store:write');
    const scope = scopeFromAuth(auth);

    const connection = await prisma.storeConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, organisationId: true, name: true, companyId: true },
    });
    assertTenantAccess(connection, scope, 'store');

    // Typed confirmation: destructive and outward-facing.
    if (confirmation.trim().toLowerCase() !== connection!.name.trim().toLowerCase()) {
      return {
        ok: false,
        error: `Type the store name exactly — “${connection!.name}” — to confirm disconnection.`,
      };
    }

    const result = await disconnectStore(connectionId);

    await recordAudit({
      scope,
      action: AUDIT_ACTIONS.CONNECTION_DISCONNECTED,
      resourceType: 'connection',
      resourceId: connectionId,
      resourceLabel: connection!.name,
      connectionId,
      companyId: connection!.companyId,
      after: { message: result.message },
      ipHash: await currentRequestIpHash(),
    });

    revalidatePath('/stores');
    return { ok: true };
  } catch (error) {
    const appError = toAppError(error);
    return { ok: false, error: appError.message };
  }
}
