#!/usr/bin/env node
/**
 * Route smoke test.
 *
 * Mints a real session directly in the database, then requests every route with
 * that cookie and reports the status. Catches server-render failures that a
 * type check cannot: bad Prisma queries, missing props, serialisation errors.
 *
 * Usage: node scripts/smoke-routes.mjs [baseUrl]
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3123';
const prisma = new PrismaClient();

const STATIC_ROUTES = [
  '/login',
  '/overview',
  '/overview?range=last7',
  '/overview?range=yearToDate',
  '/analytics',
  '/companies',
  '/stores',
  '/stores?view=table',
  '/stores?health=CRITICAL',
  '/store-groups',
  '/catalog',
  '/pricing',
  '/inventory',
  '/content',
  '/themes',
  '/orders',
  '/customers',
  '/customer-groups',
  '/promotions',
  '/deployments',
  '/sync',
  '/conflicts',
  '/integrations',
  '/audit',
  '/settings',
  '/settings/companies',
  '/settings/brands',
  '/settings/inheritance',
  '/settings/approvals',
  '/settings/notifications',
  '/settings/security',
  '/settings/feature-flags',
  '/settings/retention',
  '/settings/manual-actions',
  '/settings/developer',
  '/stores/new',
  '/deployments/new',
  '/api/search?q=acme',
];

async function main() {
  const user = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No seeded user. Run `npm run db:seed` first.');

  const membership = await prisma.organisationMembership.findFirstOrThrow({ where: { userId: user.id } });

  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      userId: user.id,
      organisationId: membership.organisationId,
      expiresAt: new Date(Date.now() + 3_600_000),
      userAgent: 'smoke-routes',
    },
  });

  // Dynamic routes, built from real ids so detail pages are covered too.
  const [store, order, customer, deployment, job, conflict, group, product] = await Promise.all([
    prisma.storeConnection.findFirst({ select: { id: true } }),
    prisma.orderSnapshot.findFirst({ select: { id: true } }),
    prisma.customerSnapshot.findFirst({ select: { id: true } }),
    prisma.deployment.findFirst({ select: { id: true } }),
    prisma.syncJob.findFirst({ select: { id: true } }),
    prisma.conflict.findFirst({ select: { id: true } }),
    prisma.storeGroup.findFirst({ select: { id: true } }),
    prisma.productSnapshot.findFirst({ select: { sku: true } }),
  ]);

  const routes = [...STATIC_ROUTES];
  if (store) {
    routes.push(`/stores/${store.id}`);
    for (const tab of [
      'configuration',
      'storefronts',
      'catalog',
      'pricing',
      'inventory',
      'content',
      'theme',
      'orders',
      'customers',
      'analytics',
      'sync',
      'audit',
      'credentials',
      'capabilities',
    ]) {
      routes.push(`/stores/${store.id}?tab=${tab}`);
    }
  }
  if (order) routes.push(`/orders/${order.id}`);
  if (customer) routes.push(`/customers/${customer.id}`);
  if (deployment) routes.push(`/deployments/${deployment.id}`);
  if (job) routes.push(`/sync/${job.id}`);
  if (conflict) routes.push(`/conflicts/${conflict.id}`);
  if (group) routes.push(`/store-groups/${group.id}`);
  if (product) routes.push(`/catalog/${encodeURIComponent(product.sku)}`);

  let failures = 0;
  let checked = 0;

  for (const route of routes) {
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: `ccc_session=${token}` },
        redirect: 'manual',
      });
      checked += 1;
      const ms = Date.now() - started;
      const ok = response.status < 400;
      if (!ok) failures += 1;
      const marker = ok ? '✓' : '✗';
      console.log(`${marker} ${String(response.status).padEnd(3)} ${String(ms).padStart(5)}ms  ${route}`);
      if (!ok) {
        const body = await response.text();
        const match = body.match(/<h2[^>]*>([\s\S]{0,300}?)<\/h2>/) ?? body.match(/Error: ([^\n<]{0,300})/);
        if (match) console.log(`        ↳ ${match[1].replace(/\s+/g, ' ').trim()}`);
      }
    } catch (error) {
      failures += 1;
      checked += 1;
      console.log(`✗ ERR       ${route} — ${error.message}`);
    }
  }

  await prisma.session.deleteMany({ where: { userAgent: 'smoke-routes' } });
  console.log(`\n${checked - failures}/${checked} routes OK`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
