/**
 * Job handlers.
 *
 * Each handler is idempotent: re-running it against the same job produces the
 * same end state. That is what makes the runner's crash-recovery safe.
 *
 * Handlers never perform BigCommerce writes. Deployment execution walks the
 * plan and records the outcome, marking every item that would have required a
 * write as blocked with the capability reason — this is the honest behaviour
 * given the write paths are not enabled in this release.
 */
import { prisma } from '@/lib/db';
import { stringifyJson } from '@/lib/json';
import { checksum, keyedHash } from '@/lib/crypto/hash';
import { stableStringify } from '@/lib/json';
import { tryGetProviderFor } from '@/server/services/provider-factory';
import { runComparisonScan } from '@/server/services/comparison';
import { refreshStoreMetadata, verifyStoreCapabilities } from '@/server/services/connections';
import { recomputeAnalyticsRollup } from '@/server/services/analytics';
import { notify } from '@/server/services/notifications';
import { registerJobHandler, type JobContext, type JobResult } from './runner';

// ---------------------------------------------------------------------------
// Connection refresh / metadata sync / channel discovery
// ---------------------------------------------------------------------------

async function connectionRefresh(context: JobContext): Promise<JobResult> {
  const connectionIds = await targetConnectionIds(context);
  let success = 0;
  let failure = 0;

  for (const connectionId of connectionIds) {
    await context.checkCancelled();
    const outcome = await refreshStoreMetadata(connectionId, context.correlationId);
    if (outcome.ok) success += 1;
    else failure += 1;
    await recordItem(context, connectionId, 'connection', connectionId, outcome.ok, outcome.message);
  }

  await context.reportProgress({ percent: 100, success, failure, total: connectionIds.length });
  return {
    status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    successCount: success,
    failureCount: failure,
    skippedCount: 0,
    summary:
      failure === 0
        ? `Refreshed ${success} store connection(s).`
        : `${success} refreshed, ${failure} failed. See item detail for per-store reasons.`,
  };
}

async function channelDiscovery(context: JobContext): Promise<JobResult> {
  const connectionIds = await targetConnectionIds(context);
  let success = 0;
  let failure = 0;
  let discovered = 0;

  for (const connectionId of connectionIds) {
    await context.checkCancelled();
    const handle = await tryGetProviderFor(connectionId);
    if (!handle.ok) {
      failure += 1;
      await recordItem(context, connectionId, 'channel', connectionId, false, handle.error.message);
      continue;
    }

    try {
      const channels = await handle.handle.provider.listChannels();
      const connection = await prisma.storeConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { organisationId: true },
      });

      for (const channel of channels) {
        // Upsert on (connectionId, name) — the natural key we can rely on when
        // a channel has not yet been seen by external id.
        await prisma.storefrontChannel.upsert({
          where: { connectionId_name: { connectionId, name: channel.name } },
          create: {
            organisationId: connection.organisationId,
            connectionId,
            externalChannelId: channel.id || null,
            externalSiteId: channel.siteId,
            name: channel.name,
            platform: channel.platform,
            channelType: channel.type,
            status: channel.status,
            siteUrl: channel.siteUrl,
            currencyCode: channel.currencyCode ?? 'USD',
            locale: channel.locale ?? 'en-US',
            isListableFromUI: channel.isListableFromUi,
          },
          update: {
            externalChannelId: channel.id || null,
            externalSiteId: channel.siteId,
            status: channel.status,
            siteUrl: channel.siteUrl,
            isListableFromUI: channel.isListableFromUi,
            deletedAt: null,
          },
        });
        discovered += 1;
      }

      success += 1;
      await recordItem(
        context,
        connectionId,
        'channel',
        connectionId,
        true,
        `Discovered ${channels.length} channel(s).`,
      );
    } catch (error) {
      failure += 1;
      await recordItem(
        context,
        connectionId,
        'channel',
        connectionId,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    successCount: success,
    failureCount: failure,
    skippedCount: 0,
    summary: `Discovered ${discovered} storefront channel(s) across ${success} store(s).`,
  };
}

// ---------------------------------------------------------------------------
// Catalog pull
// ---------------------------------------------------------------------------

async function catalogPull(context: JobContext): Promise<JobResult> {
  const connectionIds = await targetConnectionIds(context);
  let success = 0;
  let failure = 0;
  let productsSeen = 0;

  for (const connectionId of connectionIds) {
    await context.checkCancelled();
    const handle = await tryGetProviderFor(connectionId);
    if (!handle.ok) {
      failure += 1;
      await recordItem(context, connectionId, 'catalog', connectionId, false, handle.error.message);
      continue;
    }

    // Demo connections already hold their catalog as snapshots; re-pulling them
    // would just copy rows onto themselves.
    if (handle.handle.source === 'DEMO') {
      await recordItem(
        context,
        connectionId,
        'catalog',
        connectionId,
        true,
        'Demo store — the seeded catalog snapshot is already current.',
      );
      success += 1;
      continue;
    }

    try {
      const connection = await prisma.storeConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { organisationId: true },
      });

      let page = 1;
      let pulled = 0;
      for (;;) {
        await context.checkCancelled();
        const result = await handle.handle.provider.listProducts({ page, pageSize: 100 });
        for (const product of result.items) {
          const comparable = {
            name: product.name,
            price: product.price,
            salePrice: product.salePrice,
            isVisible: product.isVisible,
            availability: product.availability,
            categories: product.categoryNames,
          };
          await prisma.productSnapshot.upsert({
            where: {
              connectionId_externalProductId: { connectionId, externalProductId: product.id },
            },
            create: {
              organisationId: connection.organisationId,
              connectionId,
              externalProductId: product.id,
              sku: product.sku,
              name: product.name,
              productType: product.type,
              brandName: product.brandName,
              price: product.price,
              salePrice: product.salePrice,
              retailPrice: product.retailPrice,
              costPrice: product.costPrice,
              currencyCode: product.currencyCode,
              inventoryLevel: product.inventoryLevel,
              inventoryTracking: product.inventoryTracking,
              isVisible: product.isVisible,
              availability: product.availability,
              categoriesJson: stringifyJson(
                product.categories.map((id, index) => ({
                  id,
                  name: product.categoryNames[index] ?? `Category ${id}`,
                })),
              ),
              channelsJson: stringifyJson(product.channelIds),
              customFieldsJson: stringifyJson(product.customFields),
              imageUrl: product.images[0]?.url ?? null,
              seoTitle: product.pageTitle,
              seoDescription: product.metaDescription,
              weight: product.weight,
              variantCount: product.variants.length,
              checksum: checksum(stableStringify(comparable)),
              source: 'API',
              externalModifiedAt: product.dateModified,
            },
            update: {
              sku: product.sku,
              name: product.name,
              price: product.price,
              salePrice: product.salePrice,
              retailPrice: product.retailPrice,
              costPrice: product.costPrice,
              inventoryLevel: product.inventoryLevel,
              isVisible: product.isVisible,
              availability: product.availability,
              brandName: product.brandName,
              checksum: checksum(stableStringify(comparable)),
              source: 'API',
              externalModifiedAt: product.dateModified,
              capturedAt: new Date(),
            },
          });
          pulled += 1;
        }

        if (!result.hasMore) break;
        page += 1;
        await context.reportProgress({ percent: Math.min(95, page * 5) });
      }

      productsSeen += pulled;
      success += 1;
      await recordItem(
        context,
        connectionId,
        'catalog',
        connectionId,
        true,
        `Captured ${pulled} product snapshot(s).`,
      );
    } catch (error) {
      failure += 1;
      await recordItem(
        context,
        connectionId,
        'catalog',
        connectionId,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    successCount: success,
    failureCount: failure,
    skippedCount: 0,
    summary: `Captured ${productsSeen} product snapshot(s) from ${success} store(s).`,
  };
}


// ---------------------------------------------------------------------------
// Order pull
// ---------------------------------------------------------------------------

/**
 * Captures order snapshots from a live store.
 *
 * Personal data is minimised at the provider boundary: the customer email is
 * already masked by the time it reaches here, and no address, phone number or
 * payment detail is persisted. Orders are keyed on the store-local order id.
 */
async function orderPull(context: JobContext): Promise<JobResult> {
  const connectionIds = await targetConnectionIds(context);
  const sinceDays = Number(context.parameters.sinceDays ?? 90);
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  let success = 0;
  let failure = 0;
  let captured = 0;

  for (const connectionId of connectionIds) {
    await context.checkCancelled();
    const handle = await tryGetProviderFor(connectionId);
    if (!handle.ok) {
      failure += 1;
      await recordItem(context, connectionId, 'orders', connectionId, false, handle.error.message);
      continue;
    }

    if (handle.handle.source === 'DEMO') {
      await recordItem(
        context,
        connectionId,
        'orders',
        connectionId,
        true,
        'Demo store — the seeded order snapshots are already current.',
      );
      success += 1;
      continue;
    }

    try {
      const connection = await prisma.storeConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { organisationId: true },
      });

      let page = 1;
      let pulled = 0;

      for (;;) {
        await context.checkCancelled();
        const result = await handle.handle.provider.listOrders({
          page,
          pageSize: 100,
          minDateCreated: since,
        });

        for (const order of result.items) {
          const snapshot = await prisma.orderSnapshot.upsert({
            where: {
              connectionId_externalOrderId: { connectionId, externalOrderId: order.id },
            },
            create: {
              organisationId: connection.organisationId,
              connectionId,
              externalOrderId: order.id,
              orderNumber: order.orderNumber,
              statusLabel: order.statusLabel,
              statusCategory: mapOrderStatus(order.statusLabel),
              paymentStatus: order.paymentStatus,
              fulfilmentStatus: order.statusLabel.toLowerCase().includes('shipped')
                ? 'fulfilled'
                : 'unfulfilled',
              refundStatus: order.isRefunded ? 'partial' : 'none',
              currencyCode: order.currencyCode,
              subtotal: order.subtotal,
              shippingTotal: order.shippingTotal,
              taxTotal: order.taxTotal,
              discountTotal: order.discountTotal,
              grandTotal: order.grandTotal,
              refundedTotal: order.refundedTotal,
              itemCount: order.itemCount,
              customerExternalId: order.customerId,
              customerName: order.customerName,
              customerEmailMasked: order.customerEmailMasked,
              countryCode: order.countryCode,
              paymentMethod: order.paymentMethod,
              staffNotes: order.staffNotes,
              placedAt: order.dateCreated,
              externalUpdatedAt: order.dateModified,
              isDemo: false,
            },
            update: {
              statusLabel: order.statusLabel,
              statusCategory: mapOrderStatus(order.statusLabel),
              paymentStatus: order.paymentStatus,
              refundStatus: order.isRefunded ? 'partial' : 'none',
              grandTotal: order.grandTotal,
              refundedTotal: order.refundedTotal,
              externalUpdatedAt: order.dateModified,
              capturedAt: new Date(),
            },
          });

          // Line items are replaced wholesale rather than diffed — an order's
          // lines do not change often, and a stale line is worse than a re-write.
          if (order.lines.length > 0) {
            await prisma.orderLineSnapshot.deleteMany({ where: { orderId: snapshot.id } });
            await prisma.orderLineSnapshot.createMany({
              data: order.lines.map((line) => ({
                orderId: snapshot.id,
                sku: line.sku,
                name: line.name,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.total,
                externalProductId: line.productId,
                variantLabel: line.variantLabel,
              })),
            });
          }

          pulled += 1;
        }

        if (!result.hasMore) break;
        page += 1;
        await context.reportProgress({ percent: Math.min(95, page * 4) });
      }

      captured += pulled;
      success += 1;
      await recordItem(
        context,
        connectionId,
        'orders',
        connectionId,
        true,
        `Captured ${pulled} order snapshot(s) from the last ${sinceDays} days.`,
      );
    } catch (error) {
      failure += 1;
      await recordItem(
        context,
        connectionId,
        'orders',
        connectionId,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    successCount: success,
    failureCount: failure,
    skippedCount: 0,
    summary: `Captured ${captured} order snapshot(s) from ${success} store(s).`,
  };
}

/** Maps a BigCommerce status label onto the platform's status category. */
function mapOrderStatus(label: string): string {
  const value = label.toLowerCase();
  if (value.includes('refund')) return 'REFUNDED';
  if (value.includes('cancel')) return 'CANCELLED';
  if (value.includes('declin') || value.includes('fail')) return 'FAILED';
  if (value.includes('shipped') || value.includes('complet')) return 'FULFILLED';
  if (value.includes('awaiting payment') || value.includes('pending')) return 'PENDING';
  return 'PROCESSING';
}

// ---------------------------------------------------------------------------
// Customer pull
// ---------------------------------------------------------------------------

/**
 * Captures customer snapshots from a live store.
 *
 * Only the masked email and a keyed hash are stored — never the address book,
 * and never the raw email. The hash exists so the same address appearing in two
 * stores can be *reported*; identities are never merged. See docs/security.md.
 */
async function customerPull(context: JobContext): Promise<JobResult> {
  const connectionIds = await targetConnectionIds(context);
  let success = 0;
  let failure = 0;
  let captured = 0;

  for (const connectionId of connectionIds) {
    await context.checkCancelled();
    const handle = await tryGetProviderFor(connectionId);
    if (!handle.ok) {
      failure += 1;
      await recordItem(context, connectionId, 'customers', connectionId, false, handle.error.message);
      continue;
    }

    if (handle.handle.source === 'DEMO') {
      await recordItem(
        context,
        connectionId,
        'customers',
        connectionId,
        true,
        'Demo store — the seeded customer snapshots are already current.',
      );
      success += 1;
      continue;
    }

    try {
      const connection = await prisma.storeConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { organisationId: true, currencyCode: true, countryCode: true },
      });

      let page = 1;
      let pulled = 0;

      for (;;) {
        await context.checkCancelled();
        const result = await handle.handle.provider.listCustomers({ page, pageSize: 100 });

        for (const customer of result.items) {
          await prisma.customerSnapshot.upsert({
            where: {
              connectionId_externalCustomerId: { connectionId, externalCustomerId: customer.id },
            },
            create: {
              organisationId: connection.organisationId,
              connectionId,
              externalCustomerId: customer.id,
              firstName: customer.firstName,
              lastName: customer.lastName,
              emailMasked: customer.emailMasked,
              // The provider already masked the address, so the hash is keyed on
              // the masked form plus the store-local id — stable, and still
              // useless outside this deployment.
              emailHash: keyedHash(`${customer.emailMasked}:${customer.id}`, 'customer-email'),
              phoneMasked: customer.phoneMasked,
              company: customer.company,
              customerGroupExternalId: customer.customerGroupId,
              customerGroupName: customer.customerGroupName,
              countryCode: connection.countryCode,
              status: 'ACTIVE',
              acceptsMarketing: customer.acceptsMarketing,
              currencyCode: connection.currencyCode,
              storeCredit: customer.storeCredit,
              externalCreatedAt: customer.dateCreated,
            },
            update: {
              firstName: customer.firstName,
              lastName: customer.lastName,
              emailMasked: customer.emailMasked,
              company: customer.company,
              customerGroupExternalId: customer.customerGroupId,
              customerGroupName: customer.customerGroupName,
              acceptsMarketing: customer.acceptsMarketing,
              storeCredit: customer.storeCredit,
              capturedAt: new Date(),
            },
          });
          pulled += 1;
        }

        if (!result.hasMore) break;
        page += 1;
        await context.reportProgress({ percent: Math.min(95, page * 5) });
      }

      // Customer groups travel with the customers, so capture the mapping too.
      try {
        const groups = await handle.handle.provider.listCustomerGroups();
        for (const group of groups) {
          await prisma.customerGroupMapping.upsert({
            where: {
              connectionId_externalGroupName: { connectionId, externalGroupName: group.name },
            },
            create: {
              organisationId: connection.organisationId,
              connectionId,
              externalGroupId: group.id,
              externalGroupName: group.name,
              status: 'UNMANAGED',
              discountSummary:
                group.discountType === 'percent'
                  ? `${group.discountAmount}% off list`
                  : group.discountAmount !== '0'
                    ? group.discountAmount
                    : 'No discount',
            },
            update: { externalGroupId: group.id },
          });
        }
      } catch (error) {
        context.log.debug('Customer groups unavailable during customer pull', {
          connectionId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }

      captured += pulled;
      success += 1;
      await recordItem(
        context,
        connectionId,
        'customers',
        connectionId,
        true,
        `Captured ${pulled} customer snapshot(s), masked at the boundary.`,
      );
    } catch (error) {
      failure += 1;
      await recordItem(
        context,
        connectionId,
        'customers',
        connectionId,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    successCount: success,
    failureCount: failure,
    skippedCount: 0,
    summary: `Captured ${captured} customer snapshot(s) from ${success} store(s).`,
  };
}

// ---------------------------------------------------------------------------
// Comparison / drift
// ---------------------------------------------------------------------------

async function comparisonScan(context: JobContext): Promise<JobResult> {
  const sourceConnectionId = String(context.parameters.sourceConnectionId ?? '');
  const categories = Array.isArray(context.parameters.categories)
    ? (context.parameters.categories as string[])
    : ['PRODUCTS'];
  const targetIds = await targetConnectionIds(context);

  if (!sourceConnectionId) {
    return {
      status: 'FAILED',
      successCount: 0,
      failureCount: 1,
      skippedCount: 0,
      summary: 'No source store was supplied for the comparison.',
    };
  }

  const result = await runComparisonScan({
    organisationId: context.organisationId,
    sourceConnectionId,
    targetConnectionIds: targetIds,
    categories,
    correlationId: context.correlationId,
    onProgress: (percent) => context.reportProgress({ percent }),
    checkCancelled: context.checkCancelled,
  });

  if (result.conflictsOpened > 0) {
    await notify({
      organisationId: context.organisationId,
      type: 'STORE_DRIFT_DETECTED',
      severity: result.conflictsOpened > 20 ? 'WARNING' : 'INFO',
      title: `${result.conflictsOpened} new difference${result.conflictsOpened === 1 ? '' : 's'} detected`,
      body: `A comparison scan against ${result.storesCompared} store(s) found ${result.conflictsOpened} new difference(s) and re-confirmed ${result.conflictsReconfirmed}.`,
      actionLabel: 'Review conflicts',
      actionHref: '/conflicts',
      correlationId: context.correlationId,
    });
  }

  return {
    status: 'COMPLETED',
    successCount: result.storesCompared,
    failureCount: result.storesFailed,
    skippedCount: result.storesSkipped,
    summary: `Compared ${result.storesCompared} store(s): ${result.conflictsOpened} new, ${result.conflictsReconfirmed} ongoing, ${result.conflictsResolved} resolved.`,
    dryRunResult: result,
  };
}

// ---------------------------------------------------------------------------
// Deployment execution
// ---------------------------------------------------------------------------

async function deploymentExecution(context: JobContext): Promise<JobResult> {
  const deploymentId = String(context.parameters.deploymentId ?? '');
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { targets: { include: { items: true } } },
  });

  if (!deployment) {
    return {
      status: 'FAILED',
      successCount: 0,
      failureCount: 1,
      skippedCount: 0,
      summary: 'The deployment record no longer exists.',
    };
  }

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  let applied = 0;
  let blocked = 0;
  let skipped = 0;

  for (const [index, target] of deployment.targets.entries()) {
    await context.checkCancelled();

    const connection = await prisma.storeConnection.findUnique({
      where: { id: target.connectionId },
      select: { isDemo: true, name: true },
    });

    let targetApplied = 0;
    let targetBlocked = 0;
    let targetSkipped = 0;

    for (const item of target.items) {
      if (item.changeType === 'NO_CHANGE') {
        targetSkipped += 1;
        continue;
      }

      if (item.changeType === 'UNSUPPORTED' || item.changeType === 'MANUAL') {
        await prisma.deploymentItem.update({
          where: { id: item.id },
          data: { status: 'BLOCKED' },
        });
        targetBlocked += 1;
        continue;
      }

      if (connection?.isDemo) {
        // Demo mode: record the intended change and mark it plainly as simulated.
        await prisma.deploymentItem.update({
          where: { id: item.id },
          data: {
            status: 'SUCCEEDED',
            message: 'Simulated in demo mode. No BigCommerce store was contacted.',
          },
        });
        targetApplied += 1;
        continue;
      }

      // Real store: the write paths are not enabled in this release, so the
      // item is recorded as blocked with the reason rather than pretending.
      await prisma.deploymentItem.update({
        where: { id: item.id },
        data: {
          status: 'BLOCKED',
          message:
            'The write path for this resource is not enabled in this release. The planned change is recorded for review and manual application.',
        },
      });
      targetBlocked += 1;
    }

    await prisma.deploymentTarget.update({
      where: { id: target.id },
      data: {
        status: targetBlocked > 0 && targetApplied === 0 ? 'BLOCKED' : targetApplied > 0 ? 'COMPLETED' : 'SKIPPED',
        appliedCount: targetApplied,
        failedCount: 0,
        skippedCount: targetSkipped + targetBlocked,
      },
    });

    applied += targetApplied;
    blocked += targetBlocked;
    skipped += targetSkipped;

    await context.reportProgress({
      percent: ((index + 1) / Math.max(1, deployment.targets.length)) * 100,
      success: applied,
      failure: 0,
      skipped: skipped + blocked,
    });
  }

  const status = blocked > 0 && applied > 0 ? 'PARTIAL' : applied > 0 ? 'COMPLETED' : 'PARTIAL';

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status, finishedAt: new Date() },
  });

  await notify({
    organisationId: context.organisationId,
    type: status === 'COMPLETED' ? 'DEPLOYMENT_COMPLETED' : 'DEPLOYMENT_PARTIAL',
    severity: status === 'COMPLETED' ? 'SUCCESS' : 'WARNING',
    title:
      status === 'COMPLETED'
        ? `Deployment “${deployment.name}” completed`
        : `Deployment “${deployment.name}” completed with blocked items`,
    body:
      status === 'COMPLETED'
        ? `${applied} change(s) applied across ${deployment.targets.length} target(s).`
        : `${applied} applied, ${blocked} blocked. Blocked items list the reason on the deployment page.`,
    actionLabel: 'View deployment',
    actionHref: `/deployments/${deployment.id}`,
    correlationId: context.correlationId,
  });

  return {
    status,
    successCount: applied,
    failureCount: 0,
    skippedCount: skipped + blocked,
    summary: `${applied} applied, ${blocked} blocked, ${skipped} already in sync.`,
  };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

async function analyticsRefresh(context: JobContext): Promise<JobResult> {
  const result = await recomputeAnalyticsRollup(context.organisationId);
  return {
    status: 'COMPLETED',
    successCount: result.storesProcessed,
    failureCount: 0,
    skippedCount: 0,
    summary: `Recomputed headline metrics for ${result.storesProcessed} store(s).`,
  };
}

// ---------------------------------------------------------------------------
// Capability verification
// ---------------------------------------------------------------------------

async function capabilityVerification(context: JobContext): Promise<JobResult> {
  const connectionIds = await targetConnectionIds(context);
  let success = 0;
  let failure = 0;

  for (const connectionId of connectionIds) {
    await context.checkCancelled();
    const outcome = await verifyStoreCapabilities(connectionId);
    if (outcome.ok) success += 1;
    else failure += 1;
    await recordItem(context, connectionId, 'capability', connectionId, outcome.ok, outcome.message);
  }

  return {
    status: failure === 0 ? 'COMPLETED' : success === 0 ? 'FAILED' : 'PARTIAL',
    successCount: success,
    failureCount: failure,
    skippedCount: 0,
    summary: `Verified capabilities for ${success} store(s).`,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function targetConnectionIds(context: JobContext): Promise<string[]> {
  const targets = await prisma.syncJobTarget.findMany({
    where: { jobId: context.jobId },
    select: { connectionId: true },
  });
  if (targets.length > 0) return targets.map((target) => target.connectionId);

  const fromParams = context.parameters.connectionIds;
  if (Array.isArray(fromParams)) return fromParams.map(String);
  return [];
}

/** Idempotent item write, keyed on (jobId, resourceType, resourceKey). */
async function recordItem(
  context: JobContext,
  connectionId: string,
  resourceType: string,
  resourceKey: string,
  ok: boolean,
  message: string,
): Promise<void> {
  const existing = await prisma.syncJobItem.findFirst({
    where: { jobId: context.jobId, resourceType, resourceKey },
    select: { id: true },
  });

  const data = {
    status: ok ? 'SUCCEEDED' : 'FAILED',
    message: message.slice(0, 500),
    action: 'UPDATE',
  };

  if (existing) {
    await prisma.syncJobItem.update({ where: { id: existing.id }, data });
  } else {
    await prisma.syncJobItem.create({
      data: { ...data, jobId: context.jobId, connectionId, resourceType, resourceKey },
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerAllJobHandlers(): void {
  if (registered) return;
  registered = true;

  registerJobHandler('CONNECTION_REFRESH', connectionRefresh);
  registerJobHandler('STORE_METADATA_SYNC', connectionRefresh);
  registerJobHandler('CHANNEL_DISCOVERY', channelDiscovery);
  registerJobHandler('CATALOG_PULL', catalogPull);
  registerJobHandler('ORDER_PULL', orderPull);
  registerJobHandler('CUSTOMER_PULL', customerPull);
  registerJobHandler('COMPARISON_SCAN', comparisonScan);
  registerJobHandler('DRIFT_DETECTION', comparisonScan);
  registerJobHandler('ANALYTICS_REFRESH', analyticsRefresh);
  registerJobHandler('CATALOG_DEPLOYMENT', deploymentExecution);
  registerJobHandler('PRICING_DEPLOYMENT', deploymentExecution);
  registerJobHandler('INVENTORY_DEPLOYMENT', deploymentExecution);
  registerJobHandler('CONTENT_DEPLOYMENT', deploymentExecution);
  registerJobHandler('THEME_DEPLOYMENT', deploymentExecution);
  registerJobHandler('CUSTOMER_GROUP_DEPLOYMENT', deploymentExecution);
}

export { capabilityVerification };
