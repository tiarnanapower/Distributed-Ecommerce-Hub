/**
 * Seeds the demo estate.
 *
 * Everything created here is fictional. There is no real merchant, customer,
 * order or payment data anywhere in this project — see docs/demo-mode.md.
 *
 * The seed is deterministic (fixed PRNG seed) and idempotent at the top level:
 * running it again clears the tenant data and rebuilds it identically.
 */
import { PrismaClient } from '@prisma/client';

import { SEED_CONNECTORS } from './seed/connectors';
import {
  CATEGORY_TREE,
  MARKET_PRICE_MULTIPLIERS,
  SEED_PRODUCTS,
  type SeedProduct,
} from './seed/catalog-data';
import {
  SEED_BRANDS,
  SEED_COMPANIES,
  SEED_CUSTOMER_GROUP_TEMPLATES,
  SEED_ENVIRONMENTS,
  SEED_STORE_GROUPS,
  SEED_STORES,
  type SeedStore,
} from './seed/estate';
import { createRandom, daysBefore, startOfDay, type Random } from './seed/random';

const prisma = new PrismaClient();
const random = createRandom(0xc0ffee01);
const NOW = new Date('2026-08-07T09:00:00.000Z');
const ANALYTICS_DAYS = 120;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const CURRENCY_EXPONENT: Record<string, number> = { JPY: 0 };

function exponentFor(currency: string): number {
  return CURRENCY_EXPONENT[currency] ?? 2;
}

function amount(value: number, currency: string): string {
  return value.toFixed(exponentFor(currency));
}

function localPrice(product: SeedProduct, currency: string, jitter = 0): number {
  const multiplier = MARKET_PRICE_MULTIPLIERS[currency] ?? 1;
  const raw = product.basePriceGbp * multiplier * (1 + jitter);
  if (exponentFor(currency) === 0) return Math.round(raw / 100) * 100;
  // Land on a familiar retail ending rather than an arbitrary decimal.
  return Math.max(0, Math.round(raw) - 0.01);
}

function checksumOf(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').repeat(4).slice(0, 32);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '••••';
  const visible =
    local.length <= 2
      ? local.charAt(0)
      : `${local.charAt(0)}${'*'.repeat(Math.min(local.length - 2, 6))}${local.charAt(local.length - 1)}`;
  return `${visible}@${domain}`;
}

function pseudoHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').repeat(8).slice(0, 64);
}

// ---------------------------------------------------------------------------
// Fictional people and companies for the demo customer records
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Amelia', 'Noah', 'Priya', 'Lucas', 'Ines', 'Mateo', 'Yuki', 'Hannah', 'Omar', 'Freya',
  'Diego', 'Sofia', 'Kenji', 'Elena', 'Marcus', 'Aisha', 'Tomas', 'Nora', 'Ravi', 'Claire',
  'Anders', 'Leila', 'Felix', 'Maya', 'Hugo', 'Zara', 'Oliver', 'Chiara', 'Sven', 'Rania',
];

const LAST_NAMES = [
  'Whitfield', 'Okonkwo', 'Nakamura', 'Lindqvist', 'Duarte', 'Bergman', 'Halvorsen', 'Rossi',
  'Mercier', 'Kowalski', 'Ferreira', 'Haddad', 'Novak', 'Sorensen', 'Castellanos', 'Bianchi',
  'Andersson', 'Moreau', 'Vermeulen', 'Ashworth', 'Delgado', 'Kaur', 'Petrov', 'Ibrahim',
];

const TRADE_COMPANIES = [
  'Northgate Retail Group', 'Bergen Home Supply', 'Cascadia Outfitters', 'Meridian Trade Partners',
  'Lakeside Interiors', 'Alpine Equipment Co.', 'Harbour & Vale', 'Studio Nine Workspace',
  'Continental Living', 'Summit Distribution', 'Delta Home Wholesale', 'Orion Workspace Supply',
];

const ORDER_STATUSES: [string, string, number][] = [
  ['Awaiting Fulfillment', 'PROCESSING', 3],
  ['Shipped', 'FULFILLED', 6],
  ['Completed', 'FULFILLED', 10],
  ['Awaiting Payment', 'PENDING', 1],
  ['Cancelled', 'CANCELLED', 1],
  ['Refunded', 'REFUNDED', 1],
  ['Partially Refunded', 'REFUNDED', 1],
];

const PAYMENT_METHODS = ['Credit Card', 'PayPal', 'Apple Pay', 'Bank Transfer', 'Invoice — 30 days'];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('› Clearing existing demo data…');
  await clearAll();

  console.log('› Creating organisation, users and hierarchy…');
  const { organisation, admin, companies, regions, brands, environments } = await seedFoundation();

  console.log('› Creating store connections and storefront channels…');
  const stores = await seedStores({ organisation, companies, regions, brands, environments, admin });

  console.log('› Creating store groups and relationships…');
  await seedGroupsAndRelationships(organisation.id, companies, stores);

  console.log('› Creating configuration templates and inheritance policies…');
  const templates = await seedTemplatesAndPolicies(organisation.id, companies, stores);

  console.log('› Creating capabilities and credentials…');
  await seedCapabilitiesAndCredentials(organisation.id, stores, admin.id);

  console.log('› Creating catalog, pricing and inventory snapshots…');
  await seedCatalog(organisation.id, stores);

  console.log('› Creating customer groups and mappings…');
  await seedCustomerGroups(organisation.id, companies, stores);

  console.log('› Creating customers and orders…');
  await seedCustomersAndOrders(organisation.id, stores);

  console.log('› Creating content, themes and promotions…');
  await seedContentThemesPromotions(organisation.id, stores, admin.id);

  console.log('› Creating analytics snapshots…');
  await seedAnalytics(organisation.id, stores);

  console.log('› Creating overrides, conflicts and mappings…');
  await seedOverridesAndConflicts(organisation.id, stores, admin.id);

  console.log('› Creating jobs, deployments and approvals…');
  await seedJobsAndDeployments(organisation.id, companies, stores, templates, admin.id);

  console.log('› Creating provisioning plan and manual actions…');
  await seedProvisioning(organisation.id, companies, stores, admin.id);

  console.log('› Creating notifications, audit events and feature flags…');
  await seedPlatformRecords(organisation.id, companies, stores, admin.id);

  console.log('› Creating the connector directory…');
  await seedConnectors();

  await printSummary();
}

// ---------------------------------------------------------------------------

async function clearAll() {
  // Order matters only where cascades are absent; deleting the organisation
  // cascades most of the graph, but connectors are global.
  await prisma.connectorDefinition.deleteMany();
  await prisma.session.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.user.deleteMany();
}

async function seedFoundation() {
  const organisation = await prisma.organisation.create({
    data: {
      name: 'Acme Global Commerce',
      slug: 'acme-global-commerce',
      legalName: 'Acme Global Commerce Holdings plc',
      reportingCurrency: 'USD',
      defaultLocale: 'en-GB',
      timezone: 'Europe/London',
      logoInitials: 'AG',
      accentColor: '#2563eb',
      planTier: 'Enterprise',
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@acmeglobal.example',
      name: 'Demo Company Admin',
      jobTitle: 'Global Ecommerce Operations Director',
      role: 'COMPANY_ADMIN',
      avatarColor: '#2563eb',
      lastLoginAt: NOW,
    },
  });

  await prisma.organisationMembership.create({
    data: {
      organisationId: organisation.id,
      userId: admin.id,
      role: 'COMPANY_ADMIN',
      // Empty scope = every company in the organisation.
      companyScopeJson: '[]',
      isDefault: true,
    },
  });

  // A second, deliberately restricted user proves the tenancy model is real
  // rather than decorative. Sign-in in v1 always selects the first admin.
  const regionalManager = await prisma.user.create({
    data: {
      email: 'emea.manager@acmeglobal.example',
      name: 'EMEA Regional Manager',
      jobTitle: 'Regional Ecommerce Manager, EMEA',
      role: 'REGIONAL_MANAGER',
      avatarColor: '#0f766e',
    },
  });

  const companies = new Map<string, { id: string; name: string }>();
  const regions = new Map<string, { id: string; companySlug: string }>();

  for (const company of SEED_COMPANIES) {
    const created = await prisma.company.create({
      data: {
        organisationId: organisation.id,
        name: company.name,
        slug: company.slug,
        code: company.code,
        description: company.description,
        businessModel: company.businessModel,
        reportingCurrency: company.reportingCurrency,
        headquarters: company.headquarters,
        accentColor: company.accentColor,
      },
    });
    companies.set(company.slug, { id: created.id, name: created.name });

    for (const region of company.regions) {
      const createdRegion = await prisma.region.create({
        data: {
          organisationId: organisation.id,
          companyId: created.id,
          name: region.name,
          code: region.code,
          countriesCsv: region.countries.join(','),
          timezone: region.timezone,
          defaultCurrency: region.currency,
        },
      });
      regions.set(`${company.slug}:${region.code}`, {
        id: createdRegion.id,
        companySlug: company.slug,
      });
    }
  }

  await prisma.organisationMembership.create({
    data: {
      organisationId: organisation.id,
      userId: regionalManager.id,
      role: 'REGIONAL_MANAGER',
      companyScopeJson: JSON.stringify([companies.get('acme-consumer')!.id]),
    },
  });

  const brands = new Map<string, string>();
  for (const brand of SEED_BRANDS) {
    const created = await prisma.brand.create({
      data: {
        organisationId: organisation.id,
        name: brand.name,
        slug: brand.slug,
        colorHex: brand.colorHex,
        description: brand.description,
      },
    });
    brands.set(brand.slug, created.id);
  }

  const environments = new Map<string, string>();
  for (const environment of SEED_ENVIRONMENTS) {
    const created = await prisma.environment.create({
      data: {
        organisationId: organisation.id,
        name: environment.name,
        slug: environment.slug,
        isProduction: environment.isProduction,
        guardrailLevel: environment.guardrailLevel,
        description: environment.description,
      },
    });
    environments.set(environment.slug, created.id);
  }

  return { organisation, admin, regionalManager, companies, regions, brands, environments };
}

interface StoreRecord {
  id: string;
  seed: SeedStore;
  channelIds: Map<string, string>;
  defaultChannelId: string;
}

async function seedStores(input: {
  organisation: { id: string };
  companies: Map<string, { id: string; name: string }>;
  regions: Map<string, { id: string }>;
  brands: Map<string, string>;
  environments: Map<string, string>;
  admin: { id: string };
}): Promise<Map<string, StoreRecord>> {
  const stores = new Map<string, StoreRecord>();

  // First pass: create every store without master links.
  for (const seed of SEED_STORES) {
    const created = await prisma.storeConnection.create({
      data: {
        organisationId: input.organisation.id,
        companyId: input.companies.get(seed.companySlug)!.id,
        regionId: input.regions.get(`${seed.companySlug}:${seed.regionCode}`)?.id ?? null,
        brandId: seed.brandSlug ? (input.brands.get(seed.brandSlug) ?? null) : null,
        environmentId: input.environments.get(seed.environmentSlug) ?? null,
        name: seed.name,
        slug: seed.slug,
        storeHash: seed.storeHash,
        connectionType: seed.connectionType,
        hierarchyMode: seed.hierarchyMode,
        classification: seed.classification,
        status: seed.status,
        healthStatus: seed.healthStatus,
        healthMessage: seed.healthMessage,
        isDemo: true,
        countryCode: seed.countryCode,
        currencyCode: seed.currencyCode,
        locale: seed.locale,
        timezone: seed.timezone,
        primaryDomain: seed.primaryDomain,
        controlPanelUrl: `https://store-${seed.storeHash}.mybigcommerce.com/manage`,
        platformPlan: seed.platformPlan,
        msfEnabled: seed.msfEnabled,
        storefrontLimit: seed.storefrontLimit,
        storefrontsUsed: seed.storefrontsUsed,
        catalogVersion: `${NOW.getFullYear()}.${String(NOW.getMonth() + 1).padStart(2, '0')}.${seed.lastSyncDaysAgo}`,
        activeThemeName: seed.themeName,
        activeThemeVersion: seed.themeVersion,
        lastSuccessfulSyncAt:
          seed.healthStatus === 'CRITICAL' ? daysBefore(NOW, 26) : daysBefore(NOW, seed.lastSyncDaysAgo, random),
        lastFailedSyncAt: seed.lastErrorSummary ? daysBefore(NOW, 0, random) : null,
        lastErrorSummary: seed.lastErrorSummary,
        lastVerifiedAt: daysBefore(NOW, seed.lastSyncDaysAgo, random),
        connectedAt: daysBefore(NOW, random.int(120, 600)),
        notes: seed.notes,
        metricsJson: '{}',
      },
    });

    const channelIds = new Map<string, string>();
    let defaultChannelId = '';

    for (const channel of seed.channels) {
      const createdChannel = await prisma.storefrontChannel.create({
        data: {
          organisationId: input.organisation.id,
          connectionId: created.id,
          externalChannelId: channel.externalId,
          externalSiteId: channel.externalId,
          name: channel.name,
          platform: 'bigcommerce',
          channelType: 'storefront',
          status: channel.status,
          isDefault: channel.isDefault,
          siteUrl: channel.siteUrl,
          currencyCode: channel.currencyCode,
          locale: channel.locale,
          countryCode: channel.countryCode,
          themeName: seed.themeName,
          catalogMode: seed.msfEnabled ? 'ASSIGNED_ONLY' : 'ALL_PRODUCTS',
          notes:
            channel.status === 'prelaunch'
              ? 'Pre-launch. Content and translations are still being prepared; the channel is not serving traffic.'
              : null,
        },
      });
      channelIds.set(channel.name, createdChannel.id);
      if (channel.isDefault) defaultChannelId = createdChannel.id;
    }

    stores.set(seed.slug, { id: created.id, seed, channelIds, defaultChannelId });
  }

  // Second pass: wire up master relationships now that every id exists.
  for (const store of stores.values()) {
    if (!store.seed.masterSlug) continue;
    const master = stores.get(store.seed.masterSlug);
    if (!master) continue;
    await prisma.storeConnection.update({
      where: { id: store.id },
      data: { masterConnectionId: master.id },
    });
  }

  return stores;
}

async function seedGroupsAndRelationships(
  organisationId: string,
  companies: Map<string, { id: string }>,
  stores: Map<string, StoreRecord>,
) {
  for (const group of SEED_STORE_GROUPS) {
    const created = await prisma.storeGroup.create({
      data: {
        organisationId,
        companyId: group.companySlug ? (companies.get(group.companySlug)?.id ?? null) : null,
        name: group.name,
        slug: group.slug,
        description: group.description,
        purpose: group.purpose,
        colorHex: group.colorHex,
      },
    });

    for (const slug of group.storeSlugs) {
      const store = stores.get(slug);
      if (!store) continue;
      await prisma.storeGroupMember.create({
        data: { storeGroupId: created.id, connectionId: store.id },
      });
    }
  }

  for (const store of stores.values()) {
    if (store.seed.masterSlug) {
      const master = stores.get(store.seed.masterSlug)!;
      await prisma.storeRelationship.create({
        data: {
          organisationId,
          parentId: master.id,
          childId: store.id,
          relationshipType: 'MASTER_CHILD',
          isActive: true,
          establishedAt: daysBefore(NOW, random.int(90, 500)),
          notes: `${store.seed.name} inherits selected resource categories from ${master.seed.name}.`,
        },
      });
    }
  }

  // A detached relationship, so the history view has something real to show.
  const outletUk = stores.get('acme-outlet-uk');
  const ukFlagship = stores.get('acme-uk-flagship');
  if (outletUk && ukFlagship) {
    await prisma.storeRelationship.create({
      data: {
        organisationId,
        parentId: ukFlagship.id,
        childId: outletUk.id,
        relationshipType: 'PEER_COMPARISON',
        isActive: false,
        establishedAt: daysBefore(NOW, 420),
        detachedAt: daysBefore(NOW, 180),
        notes:
          'Detached in favour of full autonomy. Outlet merchandising diverged far enough that continuous comparison produced only noise.',
      },
    });
  }
}

async function seedTemplatesAndPolicies(
  organisationId: string,
  companies: Map<string, { id: string }>,
  stores: Map<string, StoreRecord>,
) {
  const ukFlagship = stores.get('acme-uk-flagship')!;
  const wholesaleEmea = stores.get('acme-wholesale-emea')!;

  const globalTemplate = await prisma.configurationTemplate.create({
    data: {
      organisationId,
      name: 'Global Consumer Baseline',
      slug: 'global-consumer-baseline',
      description:
        'The organisation-wide baseline for consumer storefronts: catalogue structure, SEO defaults and checkout behaviour. Regional templates layer on top of this.',
      scopeLevel: 'ORGANISATION',
      version: 4,
      status: 'PUBLISHED',
      sourceConnectionId: ukFlagship.id,
      valuesJson: JSON.stringify({
        SEO_DEFAULTS: {
          titleTemplate: '%product% | %brand%',
          descriptionFallback: 'Shop the %category% range from %brand%, with free returns within 30 days.',
        },
        CHECKOUT_SETTINGS: { guestCheckout: true, requirePhone: false, termsRequired: true },
        STORE_SETTINGS: { weightUnits: 'metric', showProductQuantity: true },
      }),
    },
  });

  const apacTemplate = await prisma.configurationTemplate.create({
    data: {
      organisationId,
      companyId: companies.get('acme-consumer')!.id,
      name: 'APAC Consumer Template',
      slug: 'apac-consumer-template',
      description:
        'Asia-Pacific variant. Zero-decimal currency handling, local address formats and a market-specific product subset.',
      scopeLevel: 'COMPANY',
      version: 2,
      status: 'PUBLISHED',
      sourceConnectionId: ukFlagship.id,
      valuesJson: JSON.stringify({
        LOCALE_CONFIGURATION: { defaultLocale: 'ja-JP', addressFormat: 'JP' },
        CURRENCY_CONFIGURATION: { decimalPlaces: 0, thousandsSeparator: ',' },
        SEO_DEFAULTS: { titleTemplate: '%brand% %product%' },
      }),
    },
  });

  await prisma.configurationTemplate.create({
    data: {
      organisationId,
      companyId: companies.get('acme-wholesale')!.id,
      name: 'B2B Trade Template',
      slug: 'b2b-trade-template',
      description:
        'Trade storefront baseline: customer-group structure, account-based pricing and invoice payment terms.',
      scopeLevel: 'COMPANY',
      version: 3,
      status: 'PUBLISHED',
      sourceConnectionId: wholesaleEmea.id,
      valuesJson: JSON.stringify({
        CUSTOMER_GROUPS: { tiers: ['Trade Bronze', 'Trade Silver', 'Trade Gold', 'Distributor'] },
        CHECKOUT_SETTINGS: { guestCheckout: false, requirePurchaseOrder: true },
        PRICE_LISTS: { strategy: 'group-assigned' },
      }),
    },
  });

  await prisma.configurationTemplate.create({
    data: {
      organisationId,
      name: 'Outlet Baseline (draft)',
      slug: 'outlet-baseline-draft',
      description:
        'A proposed baseline for outlet stores. Still in draft while the merchandising team decides how much autonomy to keep.',
      scopeLevel: 'ORGANISATION',
      version: 1,
      status: 'DRAFT',
      sourceConnectionId: stores.get('acme-outlet-uk')!.id,
      valuesJson: JSON.stringify({
        THEMES: { name: 'Acme Outlet', minimumVersion: '1.8.0' },
        SEO_DEFAULTS: { titleTemplate: '%product% — Outlet | Acme' },
      }),
    },
  });

  await prisma.storeConnection.update({
    where: { id: stores.get('acme-japan')!.id },
    data: { templateId: apacTemplate.id },
  });

  // Organisation-wide defaults.
  const orgPolicies: [string, string][] = [
    ['PRODUCTS', 'INHERIT_WITH_OVERRIDES'],
    ['CATEGORIES', 'INHERIT_CONTINUOUS'],
    ['BRANDS', 'INHERIT_CONTINUOUS'],
    ['PRICING', 'DO_NOT_INHERIT'],
    ['PRICE_LISTS', 'COPY_ONCE'],
    ['INVENTORY_SETTINGS', 'DO_NOT_INHERIT'],
    ['CUSTOMER_GROUPS', 'REQUIRE_APPROVAL'],
    ['PROMOTIONS', 'DO_NOT_INHERIT'],
    ['PAGES', 'INHERIT_WITH_OVERRIDES'],
    ['NAVIGATION', 'READ_ONLY_COMPARISON'],
    ['WIDGETS', 'COPY_ONCE'],
    ['BANNERS', 'DO_NOT_INHERIT'],
    ['SCRIPTS', 'READ_ONLY_COMPARISON'],
    ['REDIRECTS', 'DO_NOT_INHERIT'],
    ['THEMES', 'REQUIRE_APPROVAL'],
    ['THEME_CONFIGURATION', 'INHERIT_WITH_OVERRIDES'],
    ['STORE_SETTINGS', 'INHERIT_WITH_OVERRIDES'],
    ['CHECKOUT_SETTINGS', 'REQUIRE_APPROVAL'],
    ['SHIPPING_CONFIGURATION', 'READ_ONLY_COMPARISON'],
    ['TAX_CONFIGURATION', 'READ_ONLY_COMPARISON'],
    ['CURRENCY_CONFIGURATION', 'READ_ONLY_COMPARISON'],
    ['LOCALE_CONFIGURATION', 'DO_NOT_INHERIT'],
    ['SEO_DEFAULTS', 'INHERIT_WITH_OVERRIDES'],
    ['EMAIL_TEMPLATES', 'COPY_ONCE'],
  ];

  for (const [category, mode] of orgPolicies) {
    await prisma.inheritancePolicy.create({
      data: {
        organisationId,
        scopeType: 'ORGANISATION',
        scopeId: organisationId,
        resourceCategory: category,
        mode,
        sourceType: 'MASTER_STORE',
        sourceId: ukFlagship.id,
        notes:
          mode === 'READ_ONLY_COMPARISON'
            ? 'Reported but never written — this category carries legal, financial or storefront-integrity risk.'
            : null,
      },
    });
  }

  // Company-level override: outlet stores manage their own product data.
  await prisma.inheritancePolicy.create({
    data: {
      organisationId,
      scopeType: 'COMPANY',
      scopeId: companies.get('acme-outlet')!.id,
      resourceCategory: 'PRODUCTS',
      mode: 'DO_NOT_INHERIT',
      sourceType: 'MASTER_STORE',
      sourceId: null,
      notes: 'Outlet merchandising is deliberately independent of the consumer master.',
    },
  });

  // Store-level override: Japan copies once from the template and then diverges.
  await prisma.inheritancePolicy.create({
    data: {
      organisationId,
      scopeType: 'STORE',
      scopeId: stores.get('acme-japan')!.id,
      resourceCategory: 'PRODUCTS',
      mode: 'COPY_ONCE',
      sourceType: 'TEMPLATE',
      sourceId: apacTemplate.id,
      notes:
        'Japan was seeded from the APAC template and now owns its catalogue. Comparison still runs so divergence stays visible.',
    },
  });

  // Store-level override: the dealer portal is read-only until the token is fixed.
  await prisma.inheritancePolicy.create({
    data: {
      organisationId,
      scopeType: 'STORE',
      scopeId: stores.get('acme-dealer-mea')!.id,
      resourceCategory: 'PRODUCTS',
      mode: 'READ_ONLY_COMPARISON',
      sourceType: 'MASTER_STORE',
      sourceId: wholesaleEmea.id,
      notes: 'Held read-only while the API credential is invalid. Restore write inheritance after rotation.',
    },
  });

  return { globalTemplate, apacTemplate };
}

async function seedCapabilitiesAndCredentials(
  organisationId: string,
  stores: Map<string, StoreRecord>,
  adminId: string,
) {
  const { CAPABILITY_LIST, resolveCapabilityStatus } = await import(
    '../src/lib/commerce/capability-registry'
  );

  for (const store of stores.values()) {
    const isBroken = store.seed.healthStatus === 'CRITICAL';
    const missingThemes = store.seed.slug === 'acme-germany';

    const grantedScopes = isBroken
      ? ['store_v2_information_read_only']
      : [
          'store_v2_information_read_only',
          'store_v2_products_read_only',
          'store_v2_orders_read_only',
          'store_v2_transactions_read_only',
          'store_v2_customers_read_only',
          'store_v2_content_read_only',
          'store_v2_marketing_read_only',
          'store_channel_settings_read_only',
          'store_channel_listings_read_only',
          'store_sites_read_only',
          'store_inventory_read_only',
          'store_locations_read_only',
          'store_order_fulfillment_read_only',
          ...(missingThemes ? [] : ['store_themes_read_only']),
        ];

    for (const definition of CAPABILITY_LIST) {
      const { status, reason } = resolveCapabilityStatus(definition, {
        grantedScopes,
        multiStorefrontEnabled: store.seed.msfEnabled,
        hasSpareStorefrontCapacity:
          store.seed.storefrontLimit != null && store.seed.storefrontsUsed != null
            ? store.seed.storefrontsUsed < store.seed.storefrontLimit
            : null,
        isDemo: true,
      });

      await prisma.storeCapability.create({
        data: {
          organisationId,
          connectionId: store.id,
          capabilityKey: definition.key,
          status,
          requiredScope: definition.requiredScope,
          channelApplicable: definition.channelApplicable,
          storeEligible: true,
          planDependency: definition.planDependency,
          unavailableReason: reason ?? definition.unavailableReason,
          requiresConfirmation: definition.requiresConfirmation,
          isReversible: definition.isReversible,
          verificationSource: 'DEMO',
          lastVerifiedAt: daysBefore(NOW, store.seed.lastSyncDaysAgo, random),
        },
      });
    }

    // A placeholder credential record so the Credentials tab is meaningful.
    // The ciphertext is a deliberately non-decryptable placeholder: demo stores
    // never make outbound calls, so no real secret exists or is needed.
    await prisma.credentialRecord.create({
      data: {
        organisationId,
        connectionId: store.id,
        credentialType: 'API_ACCOUNT_TOKEN',
        label: `${store.seed.name} — API account`,
        ciphertext: 'ZGVtby1wbGFjZWhvbGRlci1uby1zZWNyZXQ=',
        iv: 'ZGVtby1pdi0xMjM=',
        authTag: 'ZGVtby1hdXRoLXRhZw==',
        algorithm: 'aes-256-gcm',
        keyVersion: 1,
        maskedHint: `••••••••${store.seed.storeHash.slice(-4)}`,
        fingerprint: pseudoHash(store.seed.storeHash).slice(0, 12),
        scopesJson: JSON.stringify(grantedScopes),
        status: isBroken ? 'INVALID' : 'ACTIVE',
        lastValidatedAt: daysBefore(NOW, store.seed.lastSyncDaysAgo, random),
        lastValidationError: isBroken
          ? '401 Unauthorized from GET /v2/store — the stored API account token is no longer valid.'
          : null,
        createdByUserId: adminId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

async function seedCatalog(organisationId: string, stores: Map<string, StoreRecord>) {
  const categoryIds = new Map<string, number>();
  let nextCategoryId = 20;
  for (const branch of CATEGORY_TREE) {
    categoryIds.set(branch.name, nextCategoryId++);
    for (const child of branch.children) {
      categoryIds.set(`${branch.name}/${child}`, nextCategoryId++);
    }
  }

  for (const store of stores.values()) {
    const seed = store.seed;
    const currency = seed.currencyCode;
    let externalId = 100;

    const included = SEED_PRODUCTS.filter((product) => !seed.missingSkus.includes(product.sku));

    for (const product of included) {
      externalId += 1;
      const isOverridden = seed.overriddenSkus.includes(product.sku);
      const isHidden = seed.hiddenSkus.includes(product.sku);

      // Overridden SKUs get a deliberate local discount so drift is visible.
      const jitter = isOverridden ? -0.12 : 0;
      const price = localPrice(product, currency, jitter);
      const onSale = random.bool(0.22);
      const salePrice = onSale ? Number((price * 0.85).toFixed(exponentFor(currency))) : null;
      const inventory = product.productType === 'digital' ? null : random.int(0, 240);

      const categories = [
        { id: categoryIds.get(product.category)!, name: product.category },
        {
          id: categoryIds.get(`${product.category}/${product.subCategory}`)!,
          name: product.subCategory,
        },
      ];

      const comparable = {
        name: product.name,
        price: amount(price, currency),
        salePrice: salePrice === null ? null : amount(salePrice, currency),
        isVisible: !isHidden,
        categories: categories.map((category) => category.name),
      };

      await prisma.productSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          externalProductId: externalId,
          sku: product.sku,
          name: product.name,
          productType: product.productType,
          brandName: product.brand,
          price: amount(price, currency),
          salePrice: salePrice === null ? null : amount(salePrice, currency),
          retailPrice: amount(price * 1.15, currency),
          costPrice: amount(price * product.costRatio, currency),
          currencyCode: currency,
          inventoryLevel: inventory,
          inventoryTracking: product.productType === 'digital' ? 'none' : 'product',
          isVisible: !isHidden,
          availability: isHidden ? 'disabled' : 'available',
          categoriesJson: JSON.stringify(categories),
          channelsJson: JSON.stringify(
            seed.channels.filter((channel) => channel.status === 'active').map((channel) => channel.externalId),
          ),
          customFieldsJson: JSON.stringify(product.customFields),
          imageUrl: null,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          weight: product.weightKg.toFixed(2),
          variantCount: product.productType === 'digital' ? 0 : random.int(0, 6),
          checksum: checksumOf(comparable),
          source: 'DEMO',
          externalModifiedAt: daysBefore(NOW, random.int(0, 60), random),
        },
      });

      // Pricing entries mirror the product record and add price-list variants.
      await prisma.pricingEntry.create({
        data: {
          organisationId,
          connectionId: store.id,
          sku: product.sku,
          externalProductId: externalId,
          currencyCode: currency,
          basePrice: amount(price, currency),
          salePrice: salePrice === null ? null : amount(salePrice, currency),
          retailPrice: amount(price * 1.15, currency),
          costPrice: amount(price * product.costRatio, currency),
          origin: isOverridden ? 'LOCAL_OVERRIDE' : 'BASE',
          isOverride: isOverridden,
        },
      });

      if (product.productType === 'physical') {
        const quantity = inventory ?? 0;
        const lowThreshold = 12;
        await prisma.inventoryRecord.create({
          data: {
            organisationId,
            connectionId: store.id,
            locationExternalId: 1,
            locationName: `${seed.countryCode} Distribution Centre`,
            sku: product.sku,
            externalProductId: externalId,
            productName: product.name,
            quantity,
            safetyStock: 8,
            buffer: 4,
            lowStockThreshold: lowThreshold,
            status:
              quantity === 0 ? 'OUT_OF_STOCK' : quantity <= lowThreshold ? 'LOW' : 'IN_STOCK',
            strategy: seed.classification === 'B2B' ? 'EXTERNAL_SYSTEM' : 'INDEPENDENT',
            dataSource: seed.classification === 'B2B' ? 'NetSuite (external)' : 'DEMO',
            externalUpdatedAt: daysBefore(NOW, random.int(0, 5), random),
          },
        });
      }
    }

    // Store-local products, producing EXTRA_IN_TARGET conflicts.
    for (const local of seed.localOnlySkus) {
      externalId += 1;
      await prisma.productSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          externalProductId: externalId,
          sku: local.sku,
          name: local.name,
          productType: 'physical',
          brandName: null,
          price: amount(local.price, currency),
          currencyCode: currency,
          inventoryLevel: random.int(5, 90),
          inventoryTracking: 'product',
          isVisible: true,
          availability: 'available',
          categoriesJson: JSON.stringify([]),
          channelsJson: JSON.stringify([1]),
          customFieldsJson: JSON.stringify([
            { name: 'Local product', value: 'Created directly in this store' },
          ]),
          seoTitle: local.name,
          seoDescription: `${local.name} — available only from ${seed.name}.`,
          weight: '1.00',
          variantCount: 0,
          checksum: checksumOf({ name: local.name, price: local.price }),
          source: 'DEMO',
          externalModifiedAt: daysBefore(NOW, random.int(0, 40), random),
        },
      });
    }

    // Price lists for the B2B stores.
    if (seed.classification === 'B2B' || seed.classification === 'DEALER') {
      for (const [index, name] of ['Trade Bronze', 'Trade Silver', 'Trade Gold', 'Distributor'].entries()) {
        await prisma.priceListSnapshot.create({
          data: {
            organisationId,
            connectionId: store.id,
            externalPriceListId: 400 + index,
            name: `${name} — ${currency}`,
            currencyCode: currency,
            isActive: true,
            recordCount: included.length,
            assignmentsJson: JSON.stringify([{ type: 'customer_group', name }]),
          },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Customer groups
// ---------------------------------------------------------------------------

async function seedCustomerGroups(
  organisationId: string,
  companies: Map<string, { id: string }>,
  stores: Map<string, StoreRecord>,
) {
  const templateIds = new Map<string, string>();

  for (const template of SEED_CUSTOMER_GROUP_TEMPLATES) {
    const created = await prisma.customerGroupTemplate.create({
      data: {
        organisationId,
        companyId: companies.get(template.companySlug)?.id ?? null,
        name: template.name,
        description: template.description,
        version: 2,
        status: 'PUBLISHED',
        isDefaultGroup: template.isDefaultGroup,
        discountType: template.discountType,
        discountValue: template.discountValue,
        categoryAccessJson: JSON.stringify({ type: 'all' }),
        priceListRefsJson: JSON.stringify(
          template.discountType === 'PRICE_LIST' ? [{ name: 'Distributor', externalId: 403 }] : [],
        ),
        channelAssignmentJson: JSON.stringify([]),
      },
    });
    templateIds.set(template.name, created.id);
  }

  for (const store of stores.values()) {
    const isB2B = store.seed.classification === 'B2B' || store.seed.classification === 'DEALER';
    const groups = isB2B
      ? ['Retail', 'Trade Bronze', 'Trade Silver', 'Trade Gold', 'Distributor']
      : ['Retail', 'Loyalty', 'Employee'];

    // The North America wholesale store names one tier differently, which
    // produces a real NAME_CONFLICT for the customer-group workflow to resolve.
    const localGroups =
      store.seed.slug === 'acme-wholesale-na'
        ? ['Retail', 'Trade Bronze', 'Trade  Silver', 'Trade Gold', 'Distributor']
        : groups;

    for (const [index, name] of localGroups.entries()) {
      const templateId = templateIds.get(name.replace(/\s+/g, ' ')) ?? null;
      const discount = SEED_CUSTOMER_GROUP_TEMPLATES.find((entry) => entry.name === name);

      await prisma.customerGroupMapping.create({
        data: {
          organisationId,
          templateId,
          connectionId: store.id,
          // Ids deliberately differ per store — this is the whole point of the
          // mapping table.
          externalGroupId: 10 + index * 3 + (store.seed.slug.length % 5),
          externalGroupName: name,
          status: templateId ? 'MAPPED' : 'UNMANAGED',
          discountSummary:
            discount && discount.discountType === 'PERCENT'
              ? `${discount.discountValue}% off list`
              : name === 'Loyalty'
                ? '5% off list'
                : name === 'Employee'
                  ? '30% off list'
                  : 'No discount',
          memberCount: random.int(4, 2400),
          lastDeployedAt: templateId ? daysBefore(NOW, random.int(5, 90)) : null,
          notes:
            name === 'Trade  Silver'
              ? 'Name differs from the template by an extra space. Resolve before deploying so a duplicate group is not created.'
              : null,
        },
      });
    }
  }

  // The Nordics outlet is missing a group the template defines.
  await prisma.customerGroupMapping.updateMany({
    where: {
      connectionId: stores.get('acme-outlet-nordics')!.id,
      externalGroupName: 'Employee',
    },
    data: { status: 'MISSING_IN_TARGET', notes: 'Not yet created in this store.' },
  });
}

// ---------------------------------------------------------------------------
// Customers and orders
// ---------------------------------------------------------------------------

async function seedCustomersAndOrders(organisationId: string, stores: Map<string, StoreRecord>) {
  for (const store of stores.values()) {
    const seed = store.seed;
    const currency = seed.currencyCode;
    const isB2B = seed.classification === 'B2B' || seed.classification === 'DEALER';
    const customerCount = Math.max(6, Math.round(24 * seed.scale));

    const groups = await prisma.customerGroupMapping.findMany({
      where: { connectionId: store.id },
      select: { externalGroupId: true, externalGroupName: true },
    });

    const customers: { externalId: number; name: string; email: string }[] = [];

    for (let index = 0; index < customerCount; index += 1) {
      const firstName = random.pick(FIRST_NAMES);
      const lastName = random.pick(LAST_NAMES);
      const company = isB2B ? random.pick(TRADE_COMPANIES) : null;
      // `.example` is reserved for documentation and can never route mail.
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@${
        company ? `${company.split(' ')[0]!.toLowerCase()}.example` : 'example.com'
      }`;
      const group = random.pick(groups);
      const orderCount = random.int(0, isB2B ? 30 : 8);
      const externalId = 5000 + index;

      customers.push({ externalId, name: `${firstName} ${lastName}`, email });

      await prisma.customerSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          externalCustomerId: externalId,
          firstName,
          lastName,
          // Only the masked form and a keyed hash are stored. See docs/security.md.
          emailMasked: maskEmail(email),
          emailHash: pseudoHash(email),
          phoneMasked: random.bool(0.6) ? `••• ••• ${random.int(100, 999)}` : null,
          company,
          customerGroupExternalId: group?.externalGroupId ?? null,
          customerGroupName: group?.externalGroupName ?? null,
          countryCode: seed.countryCode,
          status: random.weighted([
            ['ACTIVE', 12],
            ['DISABLED', 1],
            ['GUEST', 3],
          ]),
          acceptsMarketing: random.bool(0.45),
          orderCount,
          lifetimeValue: amount(
            orderCount * random.float(60, isB2B ? 2400 : 260) * (MARKET_PRICE_MULTIPLIERS[currency] ?? 1),
            currency,
          ),
          currencyCode: currency,
          storeCredit: random.bool(0.1) ? amount(random.float(5, 80), currency) : amount(0, currency),
          externalCreatedAt: daysBefore(NOW, random.int(30, 900)),
          lastOrderAt: orderCount > 0 ? daysBefore(NOW, random.int(0, 120), random) : null,
        },
      });
    }

    const products = await prisma.productSnapshot.findMany({
      where: { connectionId: store.id, isVisible: true },
      select: { externalProductId: true, sku: true, name: true, price: true },
    });
    if (products.length === 0) continue;

    const orderCount = Math.max(8, Math.round(90 * seed.scale));

    for (let index = 0; index < orderCount; index += 1) {
      const placedAt = daysBefore(NOW, random.int(0, ANALYTICS_DAYS - 1), random);
      const customer = random.pick(customers);
      const [statusLabel, statusCategory] = random.weighted(
        ORDER_STATUSES.map((entry) => [[entry[0], entry[1]] as const, entry[2]] as const),
      );

      const lineCount = random.int(1, isB2B ? 8 : 4);
      const lines = random.pickMany(products, lineCount).map((product) => {
        const quantity = isB2B ? random.int(2, 24) : random.int(1, 3);
        const unitPrice = Number(product.price);
        return {
          sku: product.sku,
          name: product.name,
          quantity,
          unitPrice: amount(unitPrice, currency),
          lineTotal: amount(unitPrice * quantity, currency),
          externalProductId: product.externalProductId,
          variantLabel: null,
        };
      });

      const subtotal = lines.reduce((total, line) => total + Number(line.lineTotal), 0);
      const shipping = subtotal > 200 ? 0 : random.float(4.95, 14.95);
      const taxRate = seed.countryCode === 'US' ? 0.0825 : seed.countryCode === 'JP' ? 0.1 : 0.2;
      const tax = subtotal * taxRate;
      const discount = random.bool(0.2) ? subtotal * random.float(0.05, 0.2) : 0;
      const grand = subtotal + shipping + tax - discount;
      const refunded =
        statusCategory === 'REFUNDED'
          ? statusLabel === 'Partially Refunded'
            ? grand * random.float(0.2, 0.6)
            : grand
          : 0;

      const order = await prisma.orderSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          channelId: store.defaultChannelId || null,
          externalOrderId: 20000 + index,
          orderNumber: `${seed.storeHash.slice(0, 3).toUpperCase()}-${20000 + index}`,
          statusLabel,
          statusCategory,
          paymentStatus: statusCategory === 'PENDING' ? 'pending' : 'captured',
          fulfilmentStatus:
            statusCategory === 'FULFILLED'
              ? 'fulfilled'
              : statusCategory === 'CANCELLED'
                ? 'cancelled'
                : 'unfulfilled',
          refundStatus: refunded > 0 ? (refunded >= grand ? 'full' : 'partial') : 'none',
          currencyCode: currency,
          subtotal: amount(subtotal, currency),
          shippingTotal: amount(shipping, currency),
          taxTotal: amount(tax, currency),
          discountTotal: amount(discount, currency),
          grandTotal: amount(grand, currency),
          refundedTotal: amount(refunded, currency),
          itemCount: lines.reduce((total, line) => total + line.quantity, 0),
          customerExternalId: customer.externalId,
          customerName: customer.name,
          customerEmailMasked: maskEmail(customer.email),
          countryCode: seed.countryCode,
          paymentMethod: isB2B ? 'Invoice — 30 days' : random.pick(PAYMENT_METHODS),
          orderSource: random.pick(['storefront', 'storefront', 'storefront', 'manual', 'api']),
          staffNotes: random.bool(0.12) ? 'Customer requested delivery after 5pm.' : null,
          placedAt,
          externalUpdatedAt: placedAt,
          isDemo: true,
          lines: { create: lines },
        },
      });

      const events: { occurredAt: Date; label: string; detail: string | null; actor: string }[] = [
        { occurredAt: placedAt, label: 'Order placed', detail: `Placed on ${seed.name}.`, actor: 'Customer' },
      ];
      if (statusCategory !== 'PENDING') {
        events.push({
          occurredAt: new Date(placedAt.getTime() + 3_600_000),
          label: 'Payment captured',
          detail: `Captured via ${isB2B ? 'invoice terms' : 'the storefront payment gateway'}.`,
          actor: 'Payment gateway',
        });
      }
      if (statusCategory === 'FULFILLED') {
        events.push({
          occurredAt: new Date(placedAt.getTime() + 26 * 3_600_000),
          label: 'Shipment created',
          detail: 'Fulfilment recorded against the order.',
          actor: 'Warehouse',
        });
      }
      if (refunded > 0) {
        events.push({
          occurredAt: new Date(placedAt.getTime() + 96 * 3_600_000),
          label: refunded >= grand ? 'Full refund issued' : 'Partial refund issued',
          detail: 'Refunds are issued in the BigCommerce control panel; this platform records them read-only.',
          actor: 'Customer service',
        });
      }

      await prisma.orderEvent.createMany({
        data: events.map((event) => ({ ...event, orderId: order.id })),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Content, themes, promotions
// ---------------------------------------------------------------------------

async function seedContentThemesPromotions(
  organisationId: string,
  stores: Map<string, StoreRecord>,
  adminId: string,
) {
  const releases = new Map<string, string>();

  for (const release of [
    {
      name: 'Acme Signature',
      version: '4.2.1',
      status: 'PUBLISHED',
      notes:
        'Peak-season release. Adds the promotional hero block, improves Core Web Vitals on category pages and fixes a mini-cart focus trap.',
    },
    {
      name: 'Acme Signature',
      version: '4.3.0-rc.1',
      status: 'MANAGED',
      notes:
        'Release candidate. Introduces the new size-guide widget and the redesigned checkout summary. Currently deployed to staging only.',
    },
    {
      name: 'Acme Signature',
      version: '4.1.7',
      status: 'DEPRECATED',
      notes: 'Superseded by 4.2.1. Retained because Acme Germany still runs it with local template changes.',
    },
    {
      name: 'Acme Trade',
      version: '2.6.0',
      status: 'PUBLISHED',
      notes: 'Trade storefront release: quick-order pad, saved baskets and purchase-order fields at checkout.',
    },
    {
      name: 'Acme Trade',
      version: '2.4.2',
      status: 'DEPRECATED',
      notes: 'Older trade release still active on the MEA dealer portal.',
    },
    {
      name: 'Acme Outlet',
      version: '1.8.3',
      status: 'PUBLISHED',
      notes: 'Outlet storefront with clearance badging and a simplified navigation.',
    },
    {
      name: 'Acme Outlet',
      version: '1.7.0',
      status: 'DEPRECATED',
      notes: 'Previous outlet release, still active in the Nordics.',
    },
    {
      name: 'Acme Signature JP',
      version: '3.9.4',
      status: 'MANAGED',
      notes: 'Japan variant with vertical typography support and JP address formatting.',
    },
  ]) {
    const created = await prisma.themeRelease.create({
      data: {
        organisationId,
        name: release.name,
        version: release.version,
        status: release.status,
        packageFileName: `${release.name.toLowerCase().replace(/\s+/g, '-')}-${release.version}.zip`,
        packageSizeBytes: random.int(2_400_000, 9_800_000),
        checksum: pseudoHash(`${release.name}${release.version}`).slice(0, 40),
        releaseNotes: release.notes,
        compatibilityJson: JSON.stringify({
          stencilCli: '>=7.0.0',
          requiresMultiStorefront: false,
          testedOn: ['Acme UK Flagship', 'Acme UK Staging'],
        }),
        isSimulated: true,
        uploadedByUserId: adminId,
        createdAt: daysBefore(NOW, random.int(10, 200)),
      },
    });
    releases.set(`${release.name}@${release.version}`, created.id);
  }

  for (const store of stores.values()) {
    const seed = store.seed;

    await prisma.themeAssignment.create({
      data: {
        organisationId,
        connectionId: store.id,
        channelId: null,
        themeReleaseId: releases.get(`${seed.themeName}@${seed.themeVersion}`) ?? null,
        activeThemeName: seed.themeName,
        activeThemeVersion: seed.themeVersion,
        externalThemeUuid: pseudoHash(`${seed.slug}theme`).slice(0, 36),
        state: 'ACTIVE',
        hasLocalModifications: seed.themeHasLocalChanges,
        localModificationSummary: seed.themeHasLocalChanges
          ? seed.slug === 'acme-germany'
            ? '3 templates modified locally: product view, checkout summary and the footer legal block (German consumer-law disclosures).'
            : seed.slug === 'acme-japan'
              ? '5 templates modified locally for vertical typography and JP address formatting.'
              : seed.slug === 'acme-uk-staging'
                ? '2 templates modified while testing the 4.3.0 size-guide widget.'
                : '2 templates modified locally.'
          : null,
        configSnapshotJson: JSON.stringify({
          'colors-primary': seed.classification === 'OUTLET' ? '#b45309' : '#2563eb',
          'logo-position': 'left',
          'productpage-videos-count': 4,
          'show-product-quick-view': true,
        }),
        previewUrl: `https://${seed.primaryDomain}/?stencilEditor=preview`,
        deployedAt: daysBefore(NOW, random.int(3, 120)),
      },
    });

    const pages = [
      { key: 'about-us', title: 'About Acme', status: 'PUBLISHED' },
      { key: 'delivery-returns', title: 'Delivery & Returns', status: 'PUBLISHED' },
      { key: 'sustainability', title: 'Our Sustainability Commitments', status: 'PUBLISHED' },
      { key: 'size-guide', title: 'Size Guide', status: seed.slug === 'acme-japan' ? 'DRAFT' : 'PUBLISHED' },
      { key: 'warranty', title: 'Warranty & Repairs', status: 'PUBLISHED' },
      { key: 'peak-season-2026', title: 'Peak Season 2026 Landing Page', status: 'SCHEDULED' },
    ];

    for (const [index, page] of pages.entries()) {
      await prisma.contentSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          scopeLevel: 'STORE',
          contentType: 'PAGE',
          externalId: String(300 + index),
          contentKey: page.key,
          title:
            seed.slug === 'acme-germany' && page.key === 'delivery-returns'
              ? 'Versand & Rückgabe'
              : page.title,
          status: page.status,
          bodyJson: JSON.stringify({ format: 'html', excerpt: `${page.title} content for ${seed.name}.` }),
          metaJson: JSON.stringify({
            url: `/${page.key}`,
            metaTitle: page.title,
            metaDescription: `${page.title} — ${seed.name}.`,
            location: 'head',
          }),
          checksum: checksumOf({ key: page.key, title: page.title, status: page.status }),
          isOverride: seed.slug === 'acme-germany' && page.key === 'delivery-returns',
          scheduledFor: page.status === 'SCHEDULED' ? daysBefore(NOW, -21) : null,
          publishedAt: page.status === 'PUBLISHED' ? daysBefore(NOW, random.int(20, 400)) : null,
        },
      });
    }

    for (const [index, widget] of [
      { key: 'home-hero', title: 'Homepage hero banner', type: 'BANNER' },
      { key: 'category-promo', title: 'Category promotional strip', type: 'WIDGET' },
      { key: 'trust-badges', title: 'Trust badge row', type: 'WIDGET' },
    ].entries()) {
      await prisma.contentSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          scopeLevel: 'STORE',
          contentType: widget.type,
          externalId: String(500 + index),
          contentKey: widget.key,
          title: widget.title,
          status: 'PUBLISHED',
          bodyJson: JSON.stringify({ placement: 'home_page', region: 'home_below_menu' }),
          metaJson: JSON.stringify({ templateFile: 'pages/home' }),
          checksum: checksumOf(widget),
          publishedAt: daysBefore(NOW, random.int(10, 200)),
        },
      });
    }

    await prisma.contentSnapshot.create({
      data: {
        organisationId,
        connectionId: store.id,
        scopeLevel: 'STORE',
        contentType: 'SCRIPT',
        externalId: '900',
        contentKey: 'consent-manager',
        title: 'Consent management platform',
        status: 'PUBLISHED',
        bodyJson: JSON.stringify({ src: 'https://cdn.example/consent.js', async: true }),
        metaJson: JSON.stringify({ location: 'head', consentCategory: 'essential' }),
        checksum: checksumOf({ key: 'consent-manager', store: seed.slug }),
        publishedAt: daysBefore(NOW, 320),
      },
    });

    for (const [index, redirect] of [
      { from: '/old-kitchen', to: '/kitchen' },
      { from: '/sale', to: '/clearance' },
    ].entries()) {
      await prisma.contentSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          scopeLevel: 'STORE',
          contentType: 'REDIRECT',
          externalId: String(700 + index),
          contentKey: redirect.from,
          title: `${redirect.from} → ${redirect.to}`,
          status: 'PUBLISHED',
          bodyJson: JSON.stringify({ to: redirect.to, type: 'manual' }),
          metaJson: JSON.stringify({}),
          checksum: checksumOf(redirect),
          publishedAt: daysBefore(NOW, random.int(30, 300)),
        },
      });
    }

    // Promotions.
    const promotions: {
      name: string;
      type: string;
      status: string;
      coupon: string | null;
      summary: string;
      startsAt: Date;
      endsAt: Date | null;
    }[] = [
      {
        name: 'Peak Season — 15% sitewide',
        type: 'CART_LEVEL',
        status: 'SCHEDULED',
        coupon: null,
        summary: '15% off the cart total, minimum spend applies.',
        startsAt: daysBefore(NOW, -14),
        endsAt: daysBefore(NOW, -44),
      },
      {
        name: 'Free delivery over threshold',
        type: 'SHIPPING',
        status: 'ACTIVE',
        coupon: null,
        summary: 'Free standard delivery above the market-specific threshold.',
        startsAt: daysBefore(NOW, 200),
        endsAt: null,
      },
      {
        name: 'Welcome offer',
        type: 'COUPON',
        status: 'ACTIVE',
        coupon: `WELCOME${seed.countryCode}`,
        summary: '10% off a first order, one use per customer.',
        startsAt: daysBefore(NOW, 400),
        endsAt: null,
      },
    ];

    if (seed.classification === 'OUTLET') {
      promotions.push({
        name: 'Clearance — extra 20% off',
        type: 'PRODUCT_LEVEL',
        status: 'ACTIVE',
        coupon: 'EXTRA20',
        summary: 'An extra 20% off products already in the clearance category.',
        startsAt: daysBefore(NOW, 30),
        endsAt: daysBefore(NOW, -30),
      });
    }

    for (const [index, promotion] of promotions.entries()) {
      await prisma.promotionSnapshot.create({
        data: {
          organisationId,
          connectionId: store.id,
          externalPromotionId: 800 + index,
          name: promotion.name,
          promotionType: promotion.type,
          status: promotion.status,
          couponCode: promotion.coupon,
          redemptionType: promotion.coupon ? 'COUPON' : 'AUTOMATIC',
          discountSummary: promotion.summary,
          startsAt: promotion.startsAt,
          endsAt: promotion.endsAt,
          usageCount: random.int(0, 4200),
          usageLimit: promotion.coupon ? 10_000 : null,
          channelsJson: JSON.stringify(seed.channels.map((channel) => channel.externalId)),
          currencyCode: seed.currencyCode,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

async function seedAnalytics(organisationId: string, stores: Map<string, StoreRecord>) {
  for (const store of stores.values()) {
    const seed = store.seed;
    const currency = seed.currencyCode;
    const multiplier = MARKET_PRICE_MULTIPLIERS[currency] ?? 1;

    const rows: {
      organisationId: string;
      connectionId: string;
      channelScope: string;
      periodStart: Date;
      periodEnd: Date;
      granularity: string;
      currencyCode: string;
      revenue: string;
      refundValue: string;
      orderCount: number;
      refundCount: number;
      unitsSold: number;
      newCustomers: number;
      returningCustomers: number;
      sessions: number;
      conversionRate: number;
      source: string;
    }[] = [];

    for (let dayOffset = ANALYTICS_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
      const periodStart = startOfDay(daysBefore(NOW, dayOffset));
      const periodEnd = new Date(periodStart.getTime() + 86_399_999);

      // Weekly rhythm plus a gentle upward trend, so charts look like trading.
      const weekday = periodStart.getDay();
      const weekendFactor = weekday === 0 || weekday === 6 ? 0.78 : 1.08;
      const trend = 1 + (ANALYTICS_DAYS - dayOffset) / (ANALYTICS_DAYS * 4);
      const noise = 0.82 + random.next() * 0.4;

      const orders = Math.max(0, Math.round(26 * seed.scale * weekendFactor * trend * noise));
      const aov = 120 * multiplier * (seed.classification === 'B2B' ? 6.5 : 1) * (0.9 + random.next() * 0.25);
      const revenue = orders * aov;
      const refundCount = random.bool(0.3) ? random.int(0, Math.max(1, Math.round(orders * 0.05))) : 0;
      const refundValue = refundCount * aov * random.float(0.4, 1);
      const sessions = Math.max(orders, Math.round(orders / random.float(0.012, 0.032, 4)));

      rows.push({
        organisationId,
        connectionId: store.id,
        channelScope: 'store',
        periodStart,
        periodEnd,
        granularity: 'DAY',
        currencyCode: currency,
        revenue: amount(revenue, currency),
        refundValue: amount(refundValue, currency),
        orderCount: orders,
        refundCount,
        unitsSold: Math.round(orders * random.float(1.2, 3.4)),
        newCustomers: Math.round(orders * random.float(0.2, 0.5)),
        returningCustomers: Math.round(orders * random.float(0.3, 0.7)),
        sessions,
        conversionRate: sessions > 0 ? Number(((orders / sessions) * 100).toFixed(3)) : 0,
        source: 'DEMO',
      });
    }

    // createMany is far faster than 120 individual inserts per store.
    await prisma.analyticsSnapshot.createMany({ data: rows });
  }

  // Populate the cached directory metrics from what we just generated.
  const { recomputeAnalyticsRollup } = await import('../src/server/services/analytics');
  await recomputeAnalyticsRollup(organisationId);
}

// ---------------------------------------------------------------------------
// Overrides, conflicts and mappings
// ---------------------------------------------------------------------------

async function seedOverridesAndConflicts(
  organisationId: string,
  stores: Map<string, StoreRecord>,
  adminId: string,
) {
  const master = stores.get('acme-uk-flagship')!;

  for (const store of stores.values()) {
    for (const sku of store.seed.overriddenSkus) {
      const product = SEED_PRODUCTS.find((entry) => entry.sku === sku);
      if (!product) continue;
      const price = localPrice(product, store.seed.currencyCode, -0.12);

      await prisma.resourceOverride.create({
        data: {
          organisationId,
          connectionId: store.id,
          channelScope: 'store',
          resourceCategory: 'PRICING',
          resourceKey: sku,
          resourceLabel: product.name,
          valueJson: JSON.stringify({ price: amount(price, store.seed.currencyCode) }),
          previousValueJson: JSON.stringify({
            price: amount(localPrice(product, store.seed.currencyCode), store.seed.currencyCode),
          }),
          reason:
            store.seed.classification === 'OUTLET'
              ? 'Clearance pricing set by the outlet merchandising team.'
              : 'Local market pricing agreed with the regional commercial lead.',
          status: 'ACTIVE',
          setByUserId: adminId,
          setAt: daysBefore(NOW, random.int(10, 120)),
          // A couple of overrides are deliberately stale so the
          // SOURCE_CHANGED_AFTER_OVERRIDE path has real data.
          sourceChangedAt: random.bool(0.35) ? daysBefore(NOW, random.int(1, 8)) : null,
        },
      });
    }

    for (const sku of store.seed.hiddenSkus) {
      const product = SEED_PRODUCTS.find((entry) => entry.sku === sku);
      if (!product) continue;
      await prisma.resourceOverride.create({
        data: {
          organisationId,
          connectionId: store.id,
          channelScope: 'store',
          resourceCategory: 'PRODUCTS',
          resourceKey: sku,
          resourceLabel: product.name,
          valueJson: JSON.stringify({ isVisible: false }),
          previousValueJson: JSON.stringify({ isVisible: true }),
          reason:
            store.seed.countryCode === 'DE'
              ? 'Withheld from the German storefront pending a compliance review of the blade-length restrictions.'
              : 'Withheld from this market by the local merchandising team.',
          status: 'ACTIVE',
          setByUserId: adminId,
          setAt: daysBefore(NOW, random.int(20, 200)),
        },
      });
    }
  }

  // Product mappings from the master to every inherited consumer store.
  const masterProducts = await prisma.productSnapshot.findMany({
    where: { connectionId: master.id },
    select: { externalProductId: true, sku: true },
  });

  for (const store of stores.values()) {
    if (store.id === master.id || store.seed.masterSlug !== 'acme-uk-flagship') continue;

    const targetProducts = await prisma.productSnapshot.findMany({
      where: { connectionId: store.id },
      select: { externalProductId: true, sku: true },
    });
    const bySku = new Map(targetProducts.map((product) => [product.sku, product]));

    for (const masterProduct of masterProducts) {
      const match = bySku.get(masterProduct.sku);
      await prisma.productMapping.create({
        data: {
          organisationId,
          masterConnectionId: master.id,
          masterProductId: masterProduct.externalProductId,
          masterSku: masterProduct.sku,
          targetConnectionId: store.id,
          targetProductId: match?.externalProductId ?? null,
          targetSku: match?.sku ?? null,
          mappingStatus: match ? 'MAPPED' : 'MISSING_IN_TARGET',
          matchStrategy: 'SKU',
          confidence: match ? 1 : 1,
          driftFieldsJson: JSON.stringify(
            store.seed.overriddenSkus.includes(masterProduct.sku) ? ['price'] : [],
          ),
          lastComparedAt: daysBefore(NOW, store.seed.lastSyncDaysAgo),
        },
      });
    }
  }

  // Run the real comparison engine so the seeded conflicts are genuine output
  // of the same code path the UI triggers, not hand-written rows.
  const { runComparisonScan } = await import('../src/server/services/comparison');

  await runComparisonScan({
    organisationId,
    sourceConnectionId: master.id,
    targetConnectionIds: [...stores.values()]
      .filter((store) => store.seed.masterSlug === 'acme-uk-flagship')
      .map((store) => store.id),
    categories: ['PRODUCTS', 'THEMES', 'PAGES'],
  });

  await runComparisonScan({
    organisationId,
    sourceConnectionId: stores.get('acme-wholesale-emea')!.id,
    targetConnectionIds: [
      stores.get('acme-wholesale-na')!.id,
      stores.get('acme-dealer-mea')!.id,
    ],
    categories: ['PRODUCTS', 'CUSTOMER_GROUPS', 'THEMES'],
  });

  await runComparisonScan({
    organisationId,
    sourceConnectionId: stores.get('acme-outlet-uk')!.id,
    targetConnectionIds: [stores.get('acme-outlet-nordics')!.id],
    categories: ['PRODUCTS', 'THEMES'],
  });

  // Close a few conflicts so the resolution history is not empty.
  const resolvable = await prisma.conflict.findMany({
    where: { organisationId, status: 'OPEN' },
    take: 6,
    orderBy: { detectedAt: 'asc' },
  });

  for (const [index, conflict] of resolvable.entries()) {
    const action = index % 2 === 0 ? 'ACCEPT_VARIANCE' : 'KEEP_LOCAL';
    await prisma.conflict.update({
      where: { id: conflict.id },
      data: {
        status: action === 'ACCEPT_VARIANCE' ? 'ACCEPTED_VARIANCE' : 'RESOLVED',
        resolvedAt: daysBefore(NOW, random.int(1, 20)),
      },
    });
    await prisma.conflictResolution.create({
      data: {
        conflictId: conflict.id,
        action,
        resolvedByUserId: adminId,
        note:
          action === 'ACCEPT_VARIANCE'
            ? 'Agreed with the regional commercial lead: this difference is intentional and should stop being reported as drift.'
            : 'Local value retained. The master will be updated separately rather than overwriting this store.',
        outcome: 'RECORDED',
        createdAt: daysBefore(NOW, random.int(1, 20)),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Jobs, deployments, approvals
// ---------------------------------------------------------------------------

async function seedJobsAndDeployments(
  organisationId: string,
  companies: Map<string, { id: string }>,
  stores: Map<string, StoreRecord>,
  templates: { globalTemplate: { id: string } },
  adminId: string,
) {
  const master = stores.get('acme-uk-flagship')!;
  const consumerId = companies.get('acme-consumer')!.id;

  const jobSpecs: {
    type: string;
    status: string;
    daysAgo: number;
    dryRun: boolean;
    targets: string[];
    total: number;
    success: number;
    failure: number;
    error: string | null;
    category: string | null;
  }[] = [
    {
      type: 'CATALOG_PULL',
      status: 'COMPLETED',
      daysAgo: 0,
      dryRun: false,
      targets: ['acme-uk-flagship', 'acme-us', 'acme-canada', 'acme-australia'],
      total: 4,
      success: 4,
      failure: 0,
      error: null,
      category: 'PRODUCTS',
    },
    {
      type: 'COMPARISON_SCAN',
      status: 'COMPLETED',
      daysAgo: 0,
      dryRun: false,
      targets: ['acme-us', 'acme-germany', 'acme-canada', 'acme-australia'],
      total: 4,
      success: 4,
      failure: 0,
      error: null,
      category: 'PRODUCTS',
    },
    {
      type: 'CONNECTION_REFRESH',
      status: 'PARTIAL',
      daysAgo: 1,
      dryRun: false,
      targets: ['acme-dealer-mea', 'acme-wholesale-na'],
      total: 2,
      success: 1,
      failure: 1,
      error: 'Acme Dealer Portal MEA: 401 Unauthorized. The stored API account token is no longer valid.',
      category: null,
    },
    {
      type: 'CHANNEL_DISCOVERY',
      status: 'COMPLETED',
      daysAgo: 2,
      dryRun: false,
      targets: ['acme-uk-flagship', 'acme-wholesale-emea'],
      total: 2,
      success: 2,
      failure: 0,
      error: null,
      category: null,
    },
    {
      type: 'CATALOG_DEPLOYMENT',
      status: 'PARTIAL',
      daysAgo: 3,
      dryRun: true,
      targets: ['acme-us', 'acme-germany', 'acme-canada'],
      total: 3,
      success: 2,
      failure: 0,
      error: 'Acme Germany: theme read blocked by a missing scope, so the theme comparison step was skipped.',
      category: 'PRODUCTS',
    },
    {
      type: 'ANALYTICS_REFRESH',
      status: 'COMPLETED',
      daysAgo: 0,
      dryRun: false,
      targets: [],
      total: 12,
      success: 12,
      failure: 0,
      error: null,
      category: null,
    },
    {
      type: 'THEME_DEPLOYMENT',
      status: 'FAILED',
      daysAgo: 9,
      dryRun: false,
      targets: ['acme-japan'],
      total: 1,
      success: 0,
      failure: 1,
      error:
        'Acme Japan: the target theme version (3.9.4) is not compatible with the managed release (4.2.1). Local template changes would have been lost, so the deployment was stopped before any write.',
      category: 'THEMES',
    },
    {
      type: 'DRIFT_DETECTION',
      status: 'RUNNING',
      daysAgo: 0,
      dryRun: false,
      targets: ['acme-outlet-nordics'],
      total: 1,
      success: 0,
      failure: 0,
      error: null,
      category: 'PRODUCTS',
    },
    {
      type: 'CUSTOMER_GROUP_DEPLOYMENT',
      status: 'AWAITING_APPROVAL',
      daysAgo: 1,
      dryRun: true,
      targets: ['acme-wholesale-na', 'acme-dealer-mea'],
      total: 2,
      success: 0,
      failure: 0,
      error: null,
      category: 'CUSTOMER_GROUPS',
    },
  ];

  for (const [index, spec] of jobSpecs.entries()) {
    const startedAt = daysBefore(NOW, spec.daysAgo, random);
    const isTerminal = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(spec.status);

    const job = await prisma.syncJob.create({
      data: {
        organisationId,
        companyId: consumerId,
        jobType: spec.type,
        status: spec.status,
        resourceCategory: spec.category,
        correlationId: `job_seed_${index}_${spec.type.toLowerCase()}`,
        isDryRun: spec.dryRun,
        initiatedByUserId: adminId,
        sourceConnectionId: master.id,
        startedAt,
        finishedAt: isTerminal ? new Date(startedAt.getTime() + random.int(8, 340) * 1000) : null,
        progressPercent: isTerminal ? 100 : spec.status === 'RUNNING' ? random.int(20, 80) : 0,
        totalCount: spec.total,
        successCount: spec.success,
        failureCount: spec.failure,
        errorSummary: spec.error,
        parametersJson: JSON.stringify({
          sourceConnectionId: master.id,
          categories: spec.category ? [spec.category] : [],
        }),
        targets: {
          create: spec.targets
            .map((slug) => stores.get(slug))
            .filter((store): store is StoreRecord => Boolean(store))
            .map((store) => ({
              connectionId: store.id,
              status:
                spec.status === 'PARTIAL' && store.seed.healthStatus === 'CRITICAL'
                  ? 'FAILED'
                  : isTerminal
                    ? 'COMPLETED'
                    : 'QUEUED',
              startedAt,
              finishedAt: isTerminal ? new Date(startedAt.getTime() + 60_000) : null,
              successCount: store.seed.healthStatus === 'CRITICAL' ? 0 : 1,
              failureCount: store.seed.healthStatus === 'CRITICAL' ? 1 : 0,
              errorSummary:
                store.seed.healthStatus === 'CRITICAL'
                  ? '401 Unauthorized — the stored API account token is no longer valid.'
                  : null,
            })),
        },
      },
    });

    // A handful of item-level rows so the job detail drawer has substance.
    const targetStores = spec.targets
      .map((slug) => stores.get(slug))
      .filter((store): store is StoreRecord => Boolean(store));

    for (const store of targetStores.slice(0, 3)) {
      const skus = random.pickMany(SEED_PRODUCTS, 4);
      for (const product of skus) {
        await prisma.syncJobItem.create({
          data: {
            jobId: job.id,
            connectionId: store.id,
            resourceType: 'product',
            resourceKey: product.sku,
            resourceLabel: product.name,
            action: store.seed.missingSkus.includes(product.sku) ? 'CREATE' : 'UPDATE',
            status:
              store.seed.healthStatus === 'CRITICAL'
                ? 'FAILED'
                : spec.dryRun
                  ? 'SKIPPED'
                  : 'SUCCEEDED',
            message: spec.dryRun
              ? 'Dry run — the change was calculated but nothing was written.'
              : store.seed.healthStatus === 'CRITICAL'
                ? 'Blocked: the API account token for this store is invalid.'
                : 'Snapshot captured.',
            durationMs: random.int(40, 900),
            attempt: 1,
          },
        });
      }
    }
  }

  // --- Deployments ---------------------------------------------------------

  const deploymentSpecs = [
    {
      name: 'Peak season catalogue alignment',
      description:
        'Bring the peak-season product data from the UK master into the wave-1 consumer stores. Local price overrides are preserved.',
      category: 'PRODUCTS',
      status: 'COMPLETED',
      strategy: 'COPY_ONCE',
      risk: 'MEDIUM',
      daysAgo: 12,
      targets: ['acme-us', 'acme-canada', 'acme-australia'],
    },
    {
      name: 'Trade tier discount refresh',
      description:
        'Update the Trade Silver and Trade Gold discount structure across the wholesale estate. Requires approval before it applies.',
      category: 'CUSTOMER_GROUPS',
      status: 'AWAITING_APPROVAL',
      strategy: 'SYNC',
      risk: 'HIGH',
      daysAgo: 1,
      targets: ['acme-wholesale-na', 'acme-dealer-mea'],
    },
    {
      name: 'Acme Signature 4.2.1 rollout',
      description:
        'Roll the current managed theme release to the consumer estate. Stores with local template changes are held back for review.',
      category: 'THEMES',
      status: 'PARTIAL',
      strategy: 'OVERWRITE',
      risk: 'HIGH',
      daysAgo: 9,
      targets: ['acme-us', 'acme-germany', 'acme-canada', 'acme-japan'],
    },
    {
      name: 'Sustainability page rollout',
      description: 'Publish the updated sustainability commitments page across every consumer storefront.',
      category: 'PAGES',
      status: 'DRAFT',
      strategy: 'COPY_ONCE',
      risk: 'LOW',
      daysAgo: 0,
      targets: ['acme-us', 'acme-germany', 'acme-canada', 'acme-australia', 'acme-japan'],
    },
  ];

  for (const spec of deploymentSpecs) {
    const createdAt = daysBefore(NOW, spec.daysAgo, random);
    const targetStores = spec.targets
      .map((slug) => stores.get(slug))
      .filter((store): store is StoreRecord => Boolean(store));

    const deployment = await prisma.deployment.create({
      data: {
        organisationId,
        companyId: consumerId,
        name: spec.name,
        description: spec.description,
        resourceCategory: spec.category,
        status: spec.status,
        strategy: spec.strategy,
        riskLevel: spec.risk,
        sourceConnectionId: master.id,
        sourceTemplateId: spec.category === 'PAGES' ? templates.globalTemplate.id : null,
        createdByUserId: adminId,
        requiresApproval: spec.status === 'AWAITING_APPROVAL',
        preserveLocalOverrides: spec.strategy !== 'OVERWRITE',
        dryRunAt: createdAt,
        startedAt: ['COMPLETED', 'PARTIAL'].includes(spec.status) ? createdAt : null,
        finishedAt: ['COMPLETED', 'PARTIAL'].includes(spec.status)
          ? new Date(createdAt.getTime() + 420_000)
          : null,
        createdAt,
        blastRadiusJson: JSON.stringify({
          storeCount: targetStores.length,
          channelCount: targetStores.reduce((total, store) => total + store.seed.channels.length, 0),
          recordCount: targetStores.length * random.int(8, 40),
          destructiveCount: spec.strategy === 'OVERWRITE' ? targetStores.filter((s) => s.seed.themeHasLocalChanges).length : 0,
          storesWithLocalOverrides: targetStores.filter((store) => store.seed.overriddenSkus.length > 0).length,
          currenciesAffected: [...new Set(targetStores.map((store) => store.seed.currencyCode))],
          countriesAffected: [...new Set(targetStores.map((store) => store.seed.countryCode))],
        }),
        dryRunSummaryJson: JSON.stringify({
          calculatedAt: createdAt.toISOString(),
          warnings:
            spec.strategy === 'OVERWRITE'
              ? ['Stores with local template changes will be held back unless explicitly overridden.']
              : [],
        }),
        rollbackInfoJson:
          spec.status === 'COMPLETED'
            ? JSON.stringify({
                strategy: 'snapshot',
                capturedAt: createdAt.toISOString(),
                note: 'Pre-deployment snapshots were captured for every target and can be re-applied.',
              })
            : null,
      },
    });

    for (const store of targetStores) {
      const holdBack = spec.category === 'THEMES' && store.seed.themeHasLocalChanges;

      const target = await prisma.deploymentTarget.create({
        data: {
          deploymentId: deployment.id,
          connectionId: store.id,
          status:
            spec.status === 'DRAFT'
              ? 'PENDING'
              : holdBack
                ? 'BLOCKED'
                : spec.status === 'AWAITING_APPROVAL'
                  ? 'PENDING'
                  : 'COMPLETED',
          plannedCount: random.int(4, 24),
          appliedCount: spec.status === 'COMPLETED' && !holdBack ? random.int(4, 24) : 0,
          failedCount: 0,
          skippedCount: holdBack ? 1 : 0,
          hasLocalOverrides: store.seed.overriddenSkus.length > 0,
          requiresManualAction: holdBack,
          unsupportedReason: holdBack
            ? 'This store has local theme template changes. Overwriting would discard them, so the target is held for developer review.'
            : null,
        },
      });

      const skus = random.pickMany(SEED_PRODUCTS, 5);
      for (const product of skus) {
        const isMissing = store.seed.missingSkus.includes(product.sku);
        const isOverridden = store.seed.overriddenSkus.includes(product.sku);

        await prisma.deploymentItem.create({
          data: {
            deploymentId: deployment.id,
            targetId: target.id,
            resourceType: spec.category === 'THEMES' ? 'theme' : 'product',
            resourceKey: spec.category === 'THEMES' ? 'active-theme' : product.sku,
            resourceLabel: spec.category === 'THEMES' ? store.seed.themeName : product.name,
            changeType: holdBack
              ? 'MANUAL'
              : isMissing
                ? 'CREATE'
                : isOverridden
                  ? 'NO_CHANGE'
                  : 'UPDATE',
            status:
              spec.status === 'COMPLETED' && !holdBack
                ? 'SUCCEEDED'
                : holdBack
                  ? 'BLOCKED'
                  : 'PLANNED',
            beforeJson: JSON.stringify({ price: '—', exists: !isMissing }),
            afterJson: JSON.stringify({ source: 'Acme UK Flagship' }),
            isDestructive: spec.strategy === 'OVERWRITE' && store.seed.themeHasLocalChanges,
            message: isOverridden
              ? 'Skipped — this store has a local override and overrides are being preserved.'
              : holdBack
                ? 'Held for developer review: local template changes would be lost.'
                : null,
          },
        });
      }
    }

    if (spec.status === 'AWAITING_APPROVAL') {
      const approval = await prisma.approvalRequest.create({
        data: {
          organisationId,
          subjectType: 'DEPLOYMENT',
          subjectId: deployment.id,
          title: spec.name,
          reason:
            'The trade discount structure changes what every B2B buyer pays. A second pair of eyes is required before it reaches production.',
          changeSummary:
            'Trade Silver 15% → 18%, Trade Gold 22% → 25%. Applies to 2 stores and approximately 1,400 accounts.',
          targetScope: 'Acme Wholesale — North America and MEA dealer portal',
          riskLevel: 'HIGH',
          status: 'PENDING',
          requesterId: adminId,
          createdAt,
          expiresAt: daysBefore(NOW, -7),
        },
      });
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { approvalRequestId: approval.id },
      });
    }
  }

  // A decided approval, so the approvals view has history.
  await prisma.approvalRequest.create({
    data: {
      organisationId,
      subjectType: 'THEME_RELEASE',
      subjectId: 'seed-theme-release',
      title: 'Publish Acme Signature 4.2.1 as the managed release',
      reason: 'Peak-season release sign-off after UAT on staging.',
      changeSummary:
        'Promote 4.2.1 from managed to published and make it the default target for the consumer estate.',
      targetScope: 'Acme Consumer — all production stores',
      riskLevel: 'MEDIUM',
      status: 'APPROVED',
      requesterId: adminId,
      approverId: adminId,
      decisionComment:
        'Approved. UAT passed on staging with no regressions; roll out to wave 1 first and hold Japan until its theme version is aligned.',
      decidedAt: daysBefore(NOW, 10),
      createdAt: daysBefore(NOW, 11),
    },
  });
}

// ---------------------------------------------------------------------------
// Provisioning and manual actions
// ---------------------------------------------------------------------------

async function seedProvisioning(
  organisationId: string,
  companies: Map<string, { id: string }>,
  stores: Map<string, StoreRecord>,
  adminId: string,
) {
  const plan = await prisma.provisioningPlan.create({
    data: {
      organisationId,
      companyId: companies.get('acme-consumer')!.id,
      name: 'Launch Acme Mexico',
      intendedStoreName: 'Acme Mexico',
      countryCode: 'MX',
      currencyCode: 'MXN',
      locale: 'es-MX',
      regionName: 'North America',
      brandName: 'Acme Home',
      environmentName: 'Production',
      kind: 'INDEPENDENT_STORE',
      status: 'AWAITING_BIGCOMMERCE',
      createdByUserId: adminId,
      notes:
        'Commercial approval is complete. Waiting on the BigCommerce account team to provision the store before the configuration template can be applied.',
      createdAt: daysBefore(NOW, 18),
    },
  });

  const steps: {
    title: string;
    description: string;
    category: string;
    automation: 'AUTOMATED' | 'PARTIAL' | 'MANUAL' | 'UNSUPPORTED';
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
    docsUrl: string | null;
  }[] = [
    {
      title: 'Agree the commercial plan with BigCommerce',
      description:
        'Confirm the plan tier, storefront allowance and contract terms with your BigCommerce account team.',
      category: 'Commercial',
      automation: 'UNSUPPORTED',
      status: 'COMPLETED',
      docsUrl: null,
    },
    {
      title: 'Provision the BigCommerce store',
      description:
        'There is no public API that creates a new BigCommerce store account. The store is created by BigCommerce or through the partner portal.',
      category: 'Provisioning',
      automation: 'UNSUPPORTED',
      status: 'IN_PROGRESS',
      docsUrl: 'https://developer.bigcommerce.com/docs/start/about',
    },
    {
      title: 'Create an API account and record the scopes',
      description:
        'In Settings → API accounts, create a V2/V3 API token with the scopes this platform uses, then add it on the store’s Credentials tab.',
      category: 'Access',
      automation: 'MANUAL',
      status: 'PENDING',
      docsUrl: 'https://docs.bigcommerce.com/docs/start/authentication/api-accounts',
    },
    {
      title: 'Connect the store to Commerce Command Center',
      description: 'Run the connection wizard, test the connection and verify the capability matrix.',
      category: 'Access',
      automation: 'AUTOMATED',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Apply the Global Consumer Baseline template',
      description:
        'Deploy the supported subset of the configuration template: SEO defaults, store settings and catalogue structure.',
      category: 'Configuration',
      automation: 'PARTIAL',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Set the transactional currency to MXN',
      description:
        'A store’s default transactional currency is set at creation and cannot be changed through the API afterwards. Confirm it before the store goes live.',
      category: 'Configuration',
      automation: 'UNSUPPORTED',
      status: 'PENDING',
      docsUrl: 'https://docs.bigcommerce.com/docs/start/about',
    },
    {
      title: 'Configure the payment gateway',
      description:
        'Payment-gateway credentials are entered directly in the BigCommerce control panel. This platform never reads or writes them.',
      category: 'Payments',
      automation: 'UNSUPPORTED',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Configure tax for Mexico',
      description:
        'Tax rates and zones carry legal risk and are never copied between stores. Configure them with the tax owner.',
      category: 'Tax',
      automation: 'MANUAL',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Point the domain and provision SSL',
      description:
        'Domain registration, DNS records and SSL are handled with your registrar and the BigCommerce control panel; there is no store-management API for this.',
      category: 'Domains',
      automation: 'UNSUPPORTED',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Deploy the Acme Signature theme',
      description: 'Deploy the current managed theme release and check the storefront on staging first.',
      category: 'Design',
      automation: 'PARTIAL',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Seed the catalogue from the UK master',
      description: 'Run a dry-run catalogue deployment, review the plan, then apply it.',
      category: 'Catalogue',
      automation: 'AUTOMATED',
      status: 'PENDING',
      docsUrl: null,
    },
    {
      title: 'Final pre-launch review',
      description:
        'Walk the checkout end to end, confirm tax and shipping, and check the capability matrix has no unexpected gaps.',
      category: 'Launch',
      automation: 'MANUAL',
      status: 'PENDING',
      docsUrl: null,
    },
  ];

  for (const [index, step] of steps.entries()) {
    await prisma.provisioningStep.create({
      data: {
        planId: plan.id,
        position: index + 1,
        title: step.title,
        description: step.description,
        category: step.category,
        automation: step.automation,
        status: step.status,
        docsUrl: step.docsUrl,
        completedAt: step.status === 'COMPLETED' ? daysBefore(NOW, 15) : null,
        completedByUserId: step.status === 'COMPLETED' ? adminId : null,
      },
    });
  }

  // Manual actions raised against live stores.
  const manualActions = [
    {
      connectionSlug: 'acme-canada',
      category: 'Localisation',
      title: 'Enable French-language storefront content',
      description:
        'Quebec requires French-language content. Multi-language support depends on the channel, the theme and the plan, and the translation workflow is not exposed by a public API for this configuration.',
      reason: 'No supported public API covers this configuration for a single-storefront Pro plan store.',
      currentValue: 'English only (en-CA)',
      desiredValue: 'en-CA and fr-CA',
      docsUrl: 'https://docs.bigcommerce.com/docs/start/about',
    },
    {
      connectionSlug: 'acme-germany',
      category: 'Access',
      title: 'Grant store_themes_read_only to the API account',
      description:
        'The API account for this store cannot read themes, so theme comparison and drift detection are unavailable here.',
      reason: 'Scopes are granted in the BigCommerce control panel and cannot be changed through the API.',
      currentValue: 'Themes scope not granted',
      desiredValue: 'store_themes_read_only granted',
      docsUrl: 'https://docs.bigcommerce.com/docs/start/authentication/api-accounts',
    },
    {
      connectionSlug: 'acme-dealer-mea',
      category: 'Credentials',
      title: 'Rotate the API account token',
      description:
        'The stored token was invalidated when the API account was regenerated on 12 July. Create a new token and add it on the Credentials tab.',
      reason: 'Tokens can only be created in the BigCommerce control panel.',
      currentValue: 'Invalid (401 from GET /v2/store)',
      desiredValue: 'Active token with the standard read scopes',
      docsUrl: 'https://docs.bigcommerce.com/docs/start/authentication/api-accounts',
    },
    {
      connectionSlug: 'acme-japan',
      category: 'Design',
      title: 'Align the Japan theme with the managed release',
      description:
        'Japan runs Acme Signature JP 3.9.4 with five locally modified templates. Merging them into 4.2.1 is a development task, not something this platform will attempt automatically.',
      reason: 'Theme code is never merged automatically. Local changes must be reviewed by a developer.',
      currentValue: 'Acme Signature JP 3.9.4 with local changes',
      desiredValue: 'Acme Signature 4.2.1 with the local changes reapplied',
      docsUrl: null,
    },
  ];

  for (const action of manualActions) {
    const store = stores.get(action.connectionSlug);
    await prisma.manualActionItem.create({
      data: {
        organisationId,
        connectionId: store?.id ?? null,
        category: action.category,
        title: action.title,
        description: action.description,
        reason: action.reason,
        currentValue: action.currentValue,
        desiredValue: action.desiredValue,
        docsUrl: action.docsUrl,
        status: 'PENDING',
        createdAt: daysBefore(NOW, random.int(1, 30)),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Platform records
// ---------------------------------------------------------------------------

async function seedPlatformRecords(
  organisationId: string,
  companies: Map<string, { id: string }>,
  stores: Map<string, StoreRecord>,
  adminId: string,
) {
  const notifications: {
    type: string;
    severity: string;
    title: string;
    body: string;
    storeSlug: string | null;
    href: string;
    label: string;
    daysAgo: number;
    read: boolean;
  }[] = [
    {
      type: 'TOKEN_INVALID',
      severity: 'CRITICAL',
      title: 'Acme Dealer Portal MEA — access token rejected',
      body: 'BigCommerce returned 401 for GET /v2/store. The API account was regenerated on 12 July and the new token has not been supplied. Everything shown for this store is a 26-day-old snapshot.',
      storeSlug: 'acme-dealer-mea',
      href: '/stores/{id}?tab=credentials',
      label: 'Rotate credential',
      daysAgo: 0,
      read: false,
    },
    {
      type: 'STORE_DRIFT_DETECTED',
      severity: 'WARNING',
      title: 'Acme Outlet Nordics has diverged from its master',
      body: 'Three products differ from Acme Outlet UK with no override recorded to explain it.',
      storeSlug: 'acme-outlet-nordics',
      href: '/conflicts',
      label: 'Review conflicts',
      daysAgo: 0,
      read: false,
    },
    {
      type: 'MISSING_PERMISSION',
      severity: 'WARNING',
      title: 'Acme Germany is missing the themes scope',
      body: 'Theme comparison and drift detection are unavailable for this store until store_themes_read_only is granted.',
      storeSlug: 'acme-germany',
      href: '/stores/{id}?tab=capabilities',
      label: 'View capabilities',
      daysAgo: 1,
      read: false,
    },
    {
      type: 'APPROVAL_REQUESTED',
      severity: 'INFO',
      title: 'Approval requested: Trade tier discount refresh',
      body: 'A high-risk customer-group deployment affecting roughly 1,400 trade accounts is waiting for a decision.',
      storeSlug: null,
      href: '/deployments',
      label: 'Review request',
      daysAgo: 1,
      read: false,
    },
    {
      type: 'THEME_MISMATCH',
      severity: 'WARNING',
      title: 'Two stores are behind the managed theme release',
      body: 'Acme Germany runs 4.1.7 and Acme Japan runs 3.9.4, against a managed release of 4.2.1. Both carry local template changes.',
      storeSlug: null,
      href: '/themes',
      label: 'Open theme manager',
      daysAgo: 2,
      read: false,
    },
    {
      type: 'DEPLOYMENT_PARTIAL',
      severity: 'WARNING',
      title: 'Theme rollout completed with held-back targets',
      body: 'Acme Signature 4.2.1 reached 2 of 4 stores. Acme Germany and Acme Japan were held back because overwriting would discard local template changes.',
      storeSlug: null,
      href: '/deployments',
      label: 'View deployment',
      daysAgo: 9,
      read: true,
    },
    {
      type: 'LOW_INVENTORY',
      severity: 'INFO',
      title: 'Low stock across several stores',
      body: 'Twelve products are at or below their low-stock threshold in three stores.',
      storeSlug: null,
      href: '/inventory',
      label: 'Open inventory',
      daysAgo: 0,
      read: false,
    },
    {
      type: 'MANUAL_ACTION_REQUIRED',
      severity: 'INFO',
      title: 'Four manual actions are outstanding',
      body: 'These changes have no supported public API and need to be made in the BigCommerce control panel.',
      storeSlug: null,
      href: '/settings/manual-actions',
      label: 'View checklist',
      daysAgo: 3,
      read: true,
    },
    {
      type: 'DEPLOYMENT_COMPLETED',
      severity: 'SUCCESS',
      title: 'Peak season catalogue alignment completed',
      body: '3 stores updated, 0 failures. Local price overrides were preserved.',
      storeSlug: null,
      href: '/deployments',
      label: 'View deployment',
      daysAgo: 12,
      read: true,
    },
  ];

  for (const notification of notifications) {
    const store = notification.storeSlug ? stores.get(notification.storeSlug) : null;
    await prisma.notification.create({
      data: {
        organisationId,
        userId: adminId,
        connectionId: store?.id ?? null,
        type: notification.type,
        severity: notification.severity,
        title: notification.title,
        body: notification.body,
        actionLabel: notification.label,
        actionHref: notification.href.replace('{id}', store?.id ?? ''),
        isRead: notification.read,
        readAt: notification.read ? daysBefore(NOW, notification.daysAgo) : null,
        createdAt: daysBefore(NOW, notification.daysAgo, random),
      },
    });
  }

  // --- Audit trail ---------------------------------------------------------

  const auditEvents: {
    action: string;
    resourceType: string;
    label: string;
    before: string | null;
    after: string | null;
    outcome: string;
    daysAgo: number;
    storeSlug: string | null;
    error: string | null;
  }[] = [
    {
      action: 'auth.sign_in',
      resourceType: 'session',
      label: 'Demo Company Admin',
      before: null,
      after: 'method=local, organisation=Acme Global Commerce',
      outcome: 'SUCCESS',
      daysAgo: 0,
      storeSlug: null,
      error: null,
    },
    {
      action: 'comparison.run',
      resourceType: 'comparison',
      label: 'Products — UK master vs 4 consumer stores',
      before: null,
      after: 'conflictsOpened=18, conflictsReconfirmed=6',
      outcome: 'SUCCESS',
      daysAgo: 0,
      storeSlug: null,
      error: null,
    },
    {
      action: 'connection.tested',
      resourceType: 'connection',
      label: 'Acme Dealer Portal MEA',
      before: 'healthStatus=WARNING',
      after: 'healthStatus=CRITICAL',
      outcome: 'FAILURE',
      daysAgo: 0,
      storeSlug: 'acme-dealer-mea',
      error: '401 Unauthorized from GET /v2/store — the stored API account token is no longer valid.',
    },
    {
      action: 'deployment.dry_run',
      resourceType: 'deployment',
      label: 'Trade tier discount refresh',
      before: null,
      after: 'targets=2, plannedChanges=8, riskLevel=HIGH',
      outcome: 'DRY_RUN',
      daysAgo: 1,
      storeSlug: null,
      error: null,
    },
    {
      action: 'approval.requested',
      resourceType: 'approval',
      label: 'Trade tier discount refresh',
      before: null,
      after: 'riskLevel=HIGH, approver=unassigned',
      outcome: 'SUCCESS',
      daysAgo: 1,
      storeSlug: null,
      error: null,
    },
    {
      action: 'override.set',
      resourceType: 'override',
      label: 'Acme US — pricing override on AH-KETTLE-1000',
      before: 'price=117.99',
      after: 'price=103.99, reason=Local market pricing',
      outcome: 'SUCCESS',
      daysAgo: 4,
      storeSlug: 'acme-us',
      error: null,
    },
    {
      action: 'conflict.resolved',
      resourceType: 'conflict',
      label: 'Acme Germany — product visibility variance accepted',
      before: 'status=OPEN',
      after: 'status=ACCEPTED_VARIANCE',
      outcome: 'SUCCESS',
      daysAgo: 5,
      storeSlug: 'acme-germany',
      error: null,
    },
    {
      action: 'theme.deployed',
      resourceType: 'deployment',
      label: 'Acme Signature 4.2.1 rollout',
      before: 'activeVersion=4.1.7',
      after: 'appliedTo=2, heldBack=2',
      outcome: 'PARTIAL',
      daysAgo: 9,
      storeSlug: null,
      error:
        'Acme Germany and Acme Japan were held back: overwriting would have discarded local template changes.',
    },
    {
      action: 'deployment.executed',
      resourceType: 'deployment',
      label: 'Peak season catalogue alignment',
      before: null,
      after: 'targets=3, applied=42, skipped=6',
      outcome: 'SUCCESS',
      daysAgo: 12,
      storeSlug: null,
      error: null,
    },
    {
      action: 'credential.stored',
      resourceType: 'credential',
      label: 'Acme Australia — API account',
      before: null,
      after: 'credentialType=API_ACCOUNT_TOKEN, fingerprint=recorded',
      outcome: 'SUCCESS',
      daysAgo: 40,
      storeSlug: 'acme-australia',
      error: null,
    },
    {
      action: 'settings.feature_flag_toggled',
      resourceType: 'feature_flag',
      label: 'automation-assistant',
      before: 'isEnabled=false',
      after: 'isEnabled=false, note=left disabled',
      outcome: 'SUCCESS',
      daysAgo: 22,
      storeSlug: null,
      error: null,
    },
    {
      action: 'connection.created',
      resourceType: 'connection',
      label: 'Acme UK Staging',
      before: null,
      after: 'environment=Staging, connectionType=DEVELOPMENT',
      outcome: 'SUCCESS',
      daysAgo: 95,
      storeSlug: 'acme-uk-staging',
      error: null,
    },
  ];

  for (const [index, event] of auditEvents.entries()) {
    const store = event.storeSlug ? stores.get(event.storeSlug) : null;
    await prisma.auditEvent.create({
      data: {
        organisationId,
        companyId: companies.get('acme-consumer')!.id,
        connectionId: store?.id ?? null,
        actorUserId: adminId,
        actorType: 'USER',
        actorLabel: 'Demo Company Admin',
        action: event.action,
        resourceType: event.resourceType,
        resourceId: store?.id ?? null,
        resourceLabel: event.label,
        beforeSummary: event.before,
        afterSummary: event.after,
        outcome: event.outcome,
        errorSummary: event.error,
        ipHash: pseudoHash('demo-session-ip').slice(0, 32),
        sessionId: 'seed-session',
        correlationId: `audit_seed_${index}`,
        metadataJson: JSON.stringify({ source: 'seed' }),
        createdAt: daysBefore(NOW, event.daysAgo, random),
      },
    });
  }

  // --- Feature flags -------------------------------------------------------

  const flags = [
    {
      key: 'automation-assistant',
      name: 'Automation Assistant',
      description:
        'AI-assisted operations are not configured in this environment. This build intentionally ships without any AI dependency, model provider or assistant surface.',
      isEnabled: false,
      rolloutStage: 'DISABLED',
      category: 'Assistance',
    },
    {
      key: 'catalog-write-operations',
      name: 'Catalog write operations',
      description:
        'Enables the product and category write paths against live stores. Off until per-store capability verification and an approval policy are in place.',
      isEnabled: false,
      rolloutStage: 'EXPERIMENTAL',
      category: 'Deployments',
    },
    {
      key: 'theme-upload',
      name: 'Theme package upload',
      description:
        'Enables uploading theme packages to connected stores. Off while theme deployment is modelled rather than executed.',
      isEnabled: false,
      rolloutStage: 'EXPERIMENTAL',
      category: 'Themes',
    },
    {
      key: 'channel-provisioning',
      name: 'Storefront channel provisioning',
      description:
        'Enables creating storefront channels in Multi-Storefront stores. Off because creating a channel can have billing consequences.',
      isEnabled: false,
      rolloutStage: 'BETA',
      category: 'Storefronts',
    },
    {
      key: 'reporting-currency-conversion',
      name: 'Reporting-currency conversion',
      description:
        'Allows multi-currency totals to be converted into one reporting currency. Uses clearly-labelled demo rates until a rate provider is configured.',
      isEnabled: true,
      rolloutStage: 'BETA',
      category: 'Analytics',
    },
    {
      key: 'saved-views',
      name: 'Saved table views',
      description: 'Lets users save filter and column configurations on the directory and catalog tables.',
      isEnabled: true,
      rolloutStage: 'GA',
      category: 'Platform',
    },
    {
      key: 'scheduled-comparisons',
      name: 'Scheduled comparison scans',
      description:
        'Runs drift detection on a schedule rather than on demand. Requires a durable job queue, so it is off with the local runner.',
      isEnabled: false,
      rolloutStage: 'EXPERIMENTAL',
      category: 'Sync',
    },
    {
      key: 'connector-configuration',
      name: 'Connector configuration',
      description:
        'Turns the integrations directory from display-only into a configurable connector surface. Not implemented in v1.',
      isEnabled: false,
      rolloutStage: 'DISABLED',
      category: 'Integrations',
    },
  ];

  for (const flag of flags) {
    await prisma.featureFlag.create({ data: { organisationId, ...flag } });
  }

  await prisma.savedView.create({
    data: {
      organisationId,
      userId: adminId,
      entity: 'stores',
      name: 'Stores needing attention',
      filtersJson: JSON.stringify({ healthStatus: ['WARNING', 'CRITICAL'] }),
      columnsJson: JSON.stringify(['name', 'company', 'country', 'health', 'lastSync', 'conflicts']),
      sortJson: JSON.stringify([{ id: 'health', desc: true }]),
      isShared: true,
    },
  });

  await prisma.savedView.create({
    data: {
      organisationId,
      userId: adminId,
      entity: 'stores',
      name: 'Production consumer estate',
      filtersJson: JSON.stringify({ company: ['acme-consumer'], environment: ['production'] }),
      columnsJson: JSON.stringify(['name', 'country', 'currency', 'revenue', 'orders', 'theme']),
      sortJson: JSON.stringify([{ id: 'revenue', desc: true }]),
      isShared: false,
    },
  });
}

async function seedConnectors() {
  for (const connector of SEED_CONNECTORS) {
    await prisma.connectorDefinition.create({
      data: {
        slug: connector.slug,
        name: connector.name,
        vendor: connector.vendor,
        category: connector.category,
        shortDescription: connector.shortDescription,
        longDescription: connector.longDescription,
        logoSlug: connector.logoSlug,
        logoColor: connector.logoColor,
        docsUrl: connector.docsUrl,
        status: connector.status,
        integrationType: connector.integrationType,
        supportsMultiStore: connector.supportsMultiStore,
        tagsCsv: connector.tags.join(','),
        sortOrder: connector.sortOrder,
      },
    });
  }
}

async function printSummary() {
  const [stores, channels, products, orders, customers, conflicts, jobs, deployments, audit, notifications] =
    await Promise.all([
      prisma.storeConnection.count(),
      prisma.storefrontChannel.count(),
      prisma.productSnapshot.count(),
      prisma.orderSnapshot.count(),
      prisma.customerSnapshot.count(),
      prisma.conflict.count(),
      prisma.syncJob.count(),
      prisma.deployment.count(),
      prisma.auditEvent.count(),
      prisma.notification.count(),
    ]);

  console.log(`
✓ Demo estate ready

  Organisation        Acme Global Commerce
  Sign in as          Demo Company Admin (no password — local auth)

  Stores              ${stores}
  Storefront channels ${channels}
  Products            ${products}
  Orders              ${orders}
  Customers           ${customers}
  Open conflicts      ${conflicts}
  Jobs                ${jobs}
  Deployments         ${deployments}
  Audit events        ${audit}
  Notifications       ${notifications}

  Start the app with:  npm run dev
`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
