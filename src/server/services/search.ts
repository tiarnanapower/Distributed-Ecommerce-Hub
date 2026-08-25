/**
 * Global search.
 *
 * Every query is bounded by the organisation, so a search can never surface
 * another tenant's records. SQLite has no full-text index here, so this is a
 * bounded `contains` scan across the entities the product cares about — fine
 * for a demo estate, and the seam to swap in a search service later is the
 * `searchEverything` signature.
 */
import { prisma } from '@/lib/db';
import { tenantWhere, type TenantScope } from '@/lib/tenancy';
import type { SearchResult } from '@/lib/search-types';

export type { SearchEntity, SearchResult } from '@/lib/search-types';
export { SEARCH_ENTITY_LABELS } from '@/lib/search-types';

const PER_ENTITY_LIMIT = 6;

export async function searchEverything(scope: TenantScope, query: string): Promise<SearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const where = tenantWhere(scope);
  const storeFilter = { organisationId: scope.organisationId };

  const [stores, channels, products, orders, customers, groups, jobs, deployments, audits, pages, themes] =
    await Promise.all([
      prisma.storeConnection.findMany({
        where: {
          ...where,
          deletedAt: null,
          OR: [{ name: { contains: term } }, { storeHash: { contains: term } }, { primaryDomain: { contains: term } }],
        },
        take: PER_ENTITY_LIMIT,
        select: { id: true, name: true, countryCode: true, currencyCode: true, storeHash: true },
      }),
      prisma.storefrontChannel.findMany({
        where: { ...storeFilter, deletedAt: null, name: { contains: term } },
        take: PER_ENTITY_LIMIT,
        select: { id: true, name: true, connectionId: true, connection: { select: { name: true } } },
      }),
      prisma.productSnapshot.findMany({
        where: { ...storeFilter, OR: [{ name: { contains: term } }, { sku: { contains: term } }] },
        take: PER_ENTITY_LIMIT,
        distinct: ['sku'],
        select: { id: true, name: true, sku: true, connection: { select: { name: true } } },
      }),
      prisma.orderSnapshot.findMany({
        where: {
          ...storeFilter,
          OR: [{ orderNumber: { contains: term } }, { customerName: { contains: term } }],
        },
        take: PER_ENTITY_LIMIT,
        select: {
          id: true,
          orderNumber: true,
          grandTotal: true,
          currencyCode: true,
          customerName: true,
          connection: { select: { name: true } },
        },
      }),
      prisma.customerSnapshot.findMany({
        where: {
          ...storeFilter,
          OR: [
            { firstName: { contains: term } },
            { lastName: { contains: term } },
            { company: { contains: term } },
            { emailMasked: { contains: term } },
          ],
        },
        take: PER_ENTITY_LIMIT,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          emailMasked: true,
          connection: { select: { name: true } },
        },
      }),
      prisma.customerGroupMapping.findMany({
        where: { ...storeFilter, externalGroupName: { contains: term } },
        take: PER_ENTITY_LIMIT,
        distinct: ['externalGroupName'],
        select: { id: true, externalGroupName: true, connection: { select: { name: true } } },
      }),
      prisma.syncJob.findMany({
        where: {
          organisationId: scope.organisationId,
          OR: [{ jobType: { contains: term.toUpperCase() } }, { correlationId: { contains: term } }],
        },
        take: PER_ENTITY_LIMIT,
        orderBy: { createdAt: 'desc' },
        select: { id: true, jobType: true, status: true, correlationId: true },
      }),
      prisma.deployment.findMany({
        where: { organisationId: scope.organisationId, name: { contains: term } },
        take: PER_ENTITY_LIMIT,
        select: { id: true, name: true, status: true, resourceCategory: true },
      }),
      prisma.auditEvent.findMany({
        where: {
          organisationId: scope.organisationId,
          OR: [
            { action: { contains: term } },
            { resourceLabel: { contains: term } },
            { correlationId: { contains: term } },
          ],
        },
        take: PER_ENTITY_LIMIT,
        orderBy: { createdAt: 'desc' },
        select: { id: true, action: true, resourceLabel: true, createdAt: true },
      }),
      prisma.contentSnapshot.findMany({
        where: { ...storeFilter, contentType: 'PAGE', title: { contains: term } },
        take: PER_ENTITY_LIMIT,
        distinct: ['contentKey'],
        select: { id: true, title: true, contentKey: true, connection: { select: { name: true } } },
      }),
      prisma.themeRelease.findMany({
        where: { organisationId: scope.organisationId, name: { contains: term } },
        take: PER_ENTITY_LIMIT,
        select: { id: true, name: true, version: true, status: true },
      }),
    ]);

  const results: SearchResult[] = [];

  for (const store of stores) {
    results.push({
      entity: 'store',
      id: store.id,
      title: store.name,
      subtitle: `Store · ${store.countryCode} · ${store.currencyCode}${store.storeHash ? ` · ${store.storeHash}` : ''}`,
      href: `/stores/${store.id}`,
    });
  }
  for (const channel of channels) {
    results.push({
      entity: 'channel',
      id: channel.id,
      title: channel.name,
      subtitle: `Storefront in ${channel.connection.name}`,
      href: `/stores/${channel.connectionId}?tab=storefronts`,
    });
  }
  for (const item of products) {
    results.push({
      entity: 'product',
      id: item.id,
      title: item.name,
      subtitle: `Product · ${item.sku}`,
      href: `/catalog/${encodeURIComponent(item.sku)}`,
    });
  }
  for (const order of orders) {
    results.push({
      entity: 'order',
      id: order.id,
      title: `Order ${order.orderNumber}`,
      subtitle: `${order.connection.name} · ${order.customerName ?? 'Guest'} · ${order.grandTotal} ${order.currencyCode}`,
      href: `/orders/${order.id}`,
    });
  }
  for (const customer of customers) {
    results.push({
      entity: 'customer',
      id: customer.id,
      title: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.emailMasked,
      subtitle: `Customer in ${customer.connection.name} · ${customer.emailMasked}`,
      href: `/customers/${customer.id}`,
    });
  }
  for (const group of groups) {
    results.push({
      entity: 'customer_group',
      id: group.id,
      title: group.externalGroupName,
      subtitle: `Customer group in ${group.connection.name}`,
      href: '/customer-groups',
    });
  }
  for (const job of jobs) {
    results.push({
      entity: 'job',
      id: job.id,
      title: job.jobType.replace(/_/g, ' ').toLowerCase(),
      subtitle: `Job · ${job.status} · ${job.correlationId}`,
      href: `/sync/${job.id}`,
    });
  }
  for (const deployment of deployments) {
    results.push({
      entity: 'deployment',
      id: deployment.id,
      title: deployment.name,
      subtitle: `Deployment · ${deployment.resourceCategory} · ${deployment.status}`,
      href: `/deployments/${deployment.id}`,
    });
  }
  for (const audit of audits) {
    results.push({
      entity: 'audit',
      id: audit.id,
      title: audit.resourceLabel ?? audit.action,
      subtitle: `Audit · ${audit.action} · ${audit.createdAt.toISOString().slice(0, 10)}`,
      href: `/audit?event=${audit.id}`,
    });
  }
  for (const page of pages) {
    results.push({
      entity: 'page',
      id: page.id,
      title: page.title,
      subtitle: `Page in ${page.connection?.name ?? 'the estate'}`,
      href: '/content',
    });
  }
  for (const theme of themes) {
    results.push({
      entity: 'theme',
      id: theme.id,
      title: `${theme.name} ${theme.version}`,
      subtitle: `Theme release · ${theme.status}`,
      href: '/themes',
    });
  }

  return results;
}

