/**
 * The shape of the demo estate: companies, regions, brands, environments and
 * the twelve store connections with their relationships.
 *
 * Everything here is fictional. No real merchant, customer or transaction data
 * is used anywhere in this project.
 */
import type {
  ConnectionType,
  HealthStatus,
  HierarchyMode,
  StoreClassification,
} from '../../src/lib/enums';

export interface SeedCompany {
  slug: string;
  name: string;
  code: string;
  description: string;
  businessModel: 'B2C' | 'B2B' | 'HYBRID' | 'WHOLESALE' | 'OUTLET' | 'DEALER' | 'FRANCHISE';
  reportingCurrency: string;
  headquarters: string;
  accentColor: string;
  regions: { code: string; name: string; countries: string[]; timezone: string; currency: string }[];
}

export const SEED_COMPANIES: SeedCompany[] = [
  {
    slug: 'acme-consumer',
    name: 'Acme Consumer',
    code: 'ACO',
    description:
      'Direct-to-consumer retail across home, outdoor and workspace ranges. Operates the group’s flagship storefront estate.',
    businessModel: 'B2C',
    reportingCurrency: 'GBP',
    headquarters: 'London, United Kingdom',
    accentColor: '#2563eb',
    regions: [
      { code: 'UK', name: 'United Kingdom', countries: ['GB', 'IE'], timezone: 'Europe/London', currency: 'GBP' },
      { code: 'US', name: 'United States', countries: ['US'], timezone: 'America/New_York', currency: 'USD' },
      { code: 'EU', name: 'Europe', countries: ['DE', 'FR', 'NL', 'ES', 'IT'], timezone: 'Europe/Berlin', currency: 'EUR' },
      { code: 'APAC', name: 'Asia-Pacific', countries: ['JP', 'AU', 'SG'], timezone: 'Asia/Tokyo', currency: 'JPY' },
      { code: 'NA', name: 'North America', countries: ['CA'], timezone: 'America/Toronto', currency: 'CAD' },
    ],
  },
  {
    slug: 'acme-wholesale',
    name: 'Acme Wholesale',
    code: 'AWS',
    description:
      'B2B and dealer trade. Account-based pricing, negotiated terms and a distributor portal for the Middle East and Africa.',
    businessModel: 'B2B',
    reportingCurrency: 'EUR',
    headquarters: 'Rotterdam, Netherlands',
    accentColor: '#0f766e',
    regions: [
      { code: 'EMEA', name: 'EMEA', countries: ['NL', 'DE', 'AE', 'ZA'], timezone: 'Europe/Amsterdam', currency: 'EUR' },
      { code: 'NA', name: 'North America', countries: ['US', 'CA'], timezone: 'America/Chicago', currency: 'USD' },
    ],
  },
  {
    slug: 'acme-outlet',
    name: 'Acme Outlet',
    code: 'AOU',
    description:
      'Clearance and end-of-line trading. Deliberately divergent merchandising, with its own theme and promotional calendar.',
    businessModel: 'OUTLET',
    reportingCurrency: 'GBP',
    headquarters: 'Manchester, United Kingdom',
    accentColor: '#b45309',
    regions: [
      { code: 'UK', name: 'United Kingdom', countries: ['GB'], timezone: 'Europe/London', currency: 'GBP' },
      { code: 'NORDICS', name: 'Nordics', countries: ['SE', 'NO', 'DK', 'FI'], timezone: 'Europe/Stockholm', currency: 'SEK' },
    ],
  },
];

export const SEED_BRANDS = [
  {
    slug: 'acme-home',
    name: 'Acme Home',
    colorHex: '#2563eb',
    description: 'Kitchen and living products for the everyday household.',
  },
  {
    slug: 'acme-field',
    name: 'Acme Field',
    colorHex: '#15803d',
    description: 'Technical outdoor equipment for hiking, climbing and expedition use.',
  },
  {
    slug: 'acme-studio',
    name: 'Acme Studio',
    colorHex: '#7c3aed',
    description: 'Workspace furniture and accessories for studios and home offices.',
  },
] as const;

export const SEED_ENVIRONMENTS = [
  {
    slug: 'production',
    name: 'Production',
    isProduction: true,
    guardrailLevel: 'STRICT',
    description: 'Live customer-facing stores. Destructive operations require typed confirmation and approval.',
  },
  {
    slug: 'staging',
    name: 'Staging',
    isProduction: false,
    guardrailLevel: 'STANDARD',
    description: 'Pre-production rehearsal stores used to validate deployments before they reach production.',
  },
  {
    slug: 'development',
    name: 'Development',
    isProduction: false,
    guardrailLevel: 'RELAXED',
    description: 'Developer sandboxes. Guard rails are relaxed so integration work is not slowed down.',
  },
] as const;

export interface SeedStore {
  slug: string;
  name: string;
  companySlug: string;
  regionCode: string;
  brandSlug: string | null;
  environmentSlug: string;
  storeHash: string;
  connectionType: ConnectionType;
  hierarchyMode: HierarchyMode;
  classification: StoreClassification;
  masterSlug: string | null;
  status: 'ACTIVE' | 'DEGRADED' | 'DISCONNECTED';
  healthStatus: HealthStatus;
  healthMessage: string;
  countryCode: string;
  currencyCode: string;
  locale: string;
  timezone: string;
  primaryDomain: string;
  platformPlan: string;
  msfEnabled: boolean;
  storefrontLimit: number | null;
  storefrontsUsed: number | null;
  themeName: string;
  themeVersion: string;
  themeHasLocalChanges: boolean;
  /** Relative trading volume, used to scale generated orders and revenue. */
  scale: number;
  /** Days since the last successful sync. */
  lastSyncDaysAgo: number;
  lastErrorSummary: string | null;
  notes: string;
  channels: {
    name: string;
    externalId: number;
    countryCode: string;
    currencyCode: string;
    locale: string;
    siteUrl: string;
    status: 'active' | 'prelaunch' | 'inactive';
    isDefault: boolean;
  }[];
  /** SKUs deliberately absent, to create MISSING_IN_TARGET conflicts. */
  missingSkus: string[];
  /** SKUs with a deliberate local price override. */
  overriddenSkus: string[];
  /** SKUs hidden locally, creating a visibility mismatch. */
  hiddenSkus: string[];
  /** SKUs that only exist here, creating EXTRA_IN_TARGET conflicts. */
  localOnlySkus: { sku: string; name: string; price: number }[];
}

export const SEED_STORES: SeedStore[] = [
  // --- Acme Consumer -------------------------------------------------------
  {
    slug: 'acme-uk-flagship',
    name: 'Acme UK Flagship',
    companySlug: 'acme-consumer',
    regionCode: 'UK',
    brandSlug: 'acme-home',
    environmentSlug: 'production',
    storeHash: 'a1b2c3d4e5',
    connectionType: 'MSF_PARENT',
    hierarchyMode: 'MASTER',
    classification: 'B2C',
    masterSlug: null,
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'All scopes granted. Last full catalog pull completed without errors.',
    countryCode: 'GB',
    currencyCode: 'GBP',
    locale: 'en-GB',
    timezone: 'Europe/London',
    primaryDomain: 'shop.acme.co.uk',
    platformPlan: 'Enterprise',
    msfEnabled: true,
    storefrontLimit: 5,
    storefrontsUsed: 3,
    themeName: 'Acme Signature',
    themeVersion: '4.2.1',
    themeHasLocalChanges: false,
    scale: 1,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes:
      'Group master store. Product, category and customer-group structure originate here and flow to the inherited consumer stores.',
    channels: [
      { name: 'Acme UK', externalId: 1, countryCode: 'GB', currencyCode: 'GBP', locale: 'en-GB', siteUrl: 'https://shop.acme.co.uk', status: 'active', isDefault: true },
      { name: 'Acme Ireland', externalId: 1204, countryCode: 'IE', currencyCode: 'EUR', locale: 'en-IE', siteUrl: 'https://shop.acme.ie', status: 'active', isDefault: false },
      { name: 'Acme France', externalId: 1205, countryCode: 'FR', currencyCode: 'EUR', locale: 'fr-FR', siteUrl: 'https://boutique.acme.fr', status: 'prelaunch', isDefault: false },
    ],
    missingSkus: [],
    overriddenSkus: [],
    hiddenSkus: [],
    localOnlySkus: [],
  },
  {
    slug: 'acme-us',
    name: 'Acme United States',
    companySlug: 'acme-consumer',
    regionCode: 'US',
    brandSlug: 'acme-home',
    environmentSlug: 'production',
    storeHash: 'f6g7h8i9j0',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'B2C',
    masterSlug: 'acme-uk-flagship',
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. Inheriting products, categories and customer groups from Acme UK Flagship.',
    countryCode: 'US',
    currencyCode: 'USD',
    locale: 'en-US',
    timezone: 'America/New_York',
    primaryDomain: 'shop.acme.com',
    platformPlan: 'Enterprise',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Signature',
    themeVersion: '4.2.1',
    themeHasLocalChanges: false,
    scale: 1.6,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes: 'Largest revenue store in the group. Pricing is set locally in USD; product structure is inherited.',
    channels: [
      { name: 'Acme US', externalId: 1, countryCode: 'US', currencyCode: 'USD', locale: 'en-US', siteUrl: 'https://shop.acme.com', status: 'active', isDefault: true },
    ],
    missingSkus: ['AH-RUG-200300'],
    overriddenSkus: ['AH-KETTLE-1000', 'AS-DESK-160'],
    hiddenSkus: [],
    localOnlySkus: [{ sku: 'AH-GRILL-US', name: 'Meridian Outdoor Grill (US exclusive)', price: 549 }],
  },
  {
    slug: 'acme-germany',
    name: 'Acme Germany',
    companySlug: 'acme-consumer',
    regionCode: 'EU',
    brandSlug: 'acme-home',
    environmentSlug: 'production',
    storeHash: 'k1l2m3n4o5',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'B2C',
    masterSlug: 'acme-uk-flagship',
    status: 'ACTIVE',
    healthStatus: 'WARNING',
    healthMessage:
      'Connected, but the API account is missing store_themes_read_only. Theme comparison is unavailable for this store.',
    countryCode: 'DE',
    currencyCode: 'EUR',
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    primaryDomain: 'shop.acme.de',
    platformPlan: 'Enterprise',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Signature',
    themeVersion: '4.1.7',
    themeHasLocalChanges: true,
    scale: 0.9,
    lastSyncDaysAgo: 1,
    lastErrorSummary: 'Theme read returned 403 — missing store_themes_read_only scope.',
    notes:
      'Theme is one minor version behind and carries local template changes for German consumer-law disclosures.',
    channels: [
      { name: 'Acme Deutschland', externalId: 1, countryCode: 'DE', currencyCode: 'EUR', locale: 'de-DE', siteUrl: 'https://shop.acme.de', status: 'active', isDefault: true },
    ],
    missingSkus: ['AF-STOVE-TI', 'AH-CARE-GUIDE'],
    overriddenSkus: ['AF-JACKET-3L'],
    hiddenSkus: ['AH-KNIFE-SET8'],
    localOnlySkus: [],
  },
  {
    slug: 'acme-canada',
    name: 'Acme Canada',
    companySlug: 'acme-consumer',
    regionCode: 'NA',
    brandSlug: 'acme-home',
    environmentSlug: 'production',
    storeHash: 'p6q7r8s9t0',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'B2C',
    masterSlug: 'acme-uk-flagship',
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. All scopes granted.',
    countryCode: 'CA',
    currencyCode: 'CAD',
    locale: 'en-CA',
    timezone: 'America/Toronto',
    primaryDomain: 'shop.acme.ca',
    platformPlan: 'Pro',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Signature',
    themeVersion: '4.2.1',
    themeHasLocalChanges: false,
    scale: 0.5,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes: 'Bilingual requirements are handled in the theme; French content is a tracked manual action.',
    channels: [
      { name: 'Acme Canada', externalId: 1, countryCode: 'CA', currencyCode: 'CAD', locale: 'en-CA', siteUrl: 'https://shop.acme.ca', status: 'active', isDefault: true },
    ],
    missingSkus: ['AH-RUG-200300', 'AS-SHELF-OAK'],
    overriddenSkus: [],
    hiddenSkus: [],
    localOnlySkus: [],
  },
  {
    slug: 'acme-japan',
    name: 'Acme Japan',
    companySlug: 'acme-consumer',
    regionCode: 'APAC',
    brandSlug: 'acme-studio',
    environmentSlug: 'production',
    storeHash: 'u1v2w3x4y5',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'TEMPLATE_BASED',
    classification: 'B2C',
    masterSlug: null,
    status: 'ACTIVE',
    healthStatus: 'WARNING',
    healthMessage: 'Connected. Catalog snapshot is 4 days old — the scheduled pull has not run since the last deployment.',
    countryCode: 'JP',
    currencyCode: 'JPY',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    primaryDomain: 'shop.acme.jp',
    platformPlan: 'Enterprise',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Signature JP',
    themeVersion: '3.9.4',
    themeHasLocalChanges: true,
    scale: 0.7,
    lastSyncDaysAgo: 4,
    lastErrorSummary: null,
    notes:
      'Built from the APAC configuration template rather than the UK master. Uses a zero-decimal currency, so price comparison uses whole yen.',
    channels: [
      { name: 'Acme Japan', externalId: 1, countryCode: 'JP', currencyCode: 'JPY', locale: 'ja-JP', siteUrl: 'https://shop.acme.jp', status: 'active', isDefault: true },
    ],
    missingSkus: ['AH-RUG-200300', 'AS-DESK-160', 'AF-TENT-2P'],
    overriddenSkus: ['AS-CHAIR-ERG'],
    hiddenSkus: [],
    localOnlySkus: [{ sku: 'AS-DESK-JP-120', name: 'Atelier 120cm Sit-Stand Desk (Japan sizing)', price: 92000 }],
  },
  {
    slug: 'acme-australia',
    name: 'Acme Australia',
    companySlug: 'acme-consumer',
    regionCode: 'APAC',
    brandSlug: 'acme-field',
    environmentSlug: 'production',
    storeHash: 'z6a7b8c9d0',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'B2C',
    masterSlug: 'acme-uk-flagship',
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. All scopes granted.',
    countryCode: 'AU',
    currencyCode: 'AUD',
    locale: 'en-AU',
    timezone: 'Australia/Sydney',
    primaryDomain: 'shop.acme.com.au',
    platformPlan: 'Pro',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Signature',
    themeVersion: '4.2.1',
    themeHasLocalChanges: false,
    scale: 0.45,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes: 'Outdoor range over-indexes here; the merchandising team runs a separate promotional calendar.',
    channels: [
      { name: 'Acme Australia', externalId: 1, countryCode: 'AU', currencyCode: 'AUD', locale: 'en-AU', siteUrl: 'https://shop.acme.com.au', status: 'active', isDefault: true },
    ],
    missingSkus: ['AH-RUG-200300'],
    overriddenSkus: ['AF-TENT-2P', 'AF-PACK-45L'],
    hiddenSkus: [],
    localOnlySkus: [],
  },

  // --- Acme Wholesale ------------------------------------------------------
  {
    slug: 'acme-wholesale-emea',
    name: 'Acme Wholesale EMEA',
    companySlug: 'acme-wholesale',
    regionCode: 'EMEA',
    brandSlug: null,
    environmentSlug: 'production',
    storeHash: 'e1f2g3h4i5',
    connectionType: 'MSF_PARENT',
    hierarchyMode: 'MASTER',
    classification: 'B2B',
    masterSlug: null,
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. B2B master for the wholesale estate.',
    countryCode: 'NL',
    currencyCode: 'EUR',
    locale: 'nl-NL',
    timezone: 'Europe/Amsterdam',
    primaryDomain: 'trade.acme.eu',
    platformPlan: 'Enterprise',
    msfEnabled: true,
    storefrontLimit: 3,
    storefrontsUsed: 2,
    themeName: 'Acme Trade',
    themeVersion: '2.6.0',
    themeHasLocalChanges: false,
    scale: 1.3,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes:
      'Customer-group structure and price lists originate here. Account-based pricing means the base product price is rarely what a buyer pays.',
    channels: [
      { name: 'Trade EU', externalId: 1, countryCode: 'NL', currencyCode: 'EUR', locale: 'nl-NL', siteUrl: 'https://trade.acme.eu', status: 'active', isDefault: true },
      { name: 'Trade UK', externalId: 1310, countryCode: 'GB', currencyCode: 'GBP', locale: 'en-GB', siteUrl: 'https://trade.acme.co.uk', status: 'active', isDefault: false },
    ],
    missingSkus: ['AH-CARE-GUIDE'],
    overriddenSkus: [],
    hiddenSkus: [],
    localOnlySkus: [],
  },
  {
    slug: 'acme-wholesale-na',
    name: 'Acme Wholesale North America',
    companySlug: 'acme-wholesale',
    regionCode: 'NA',
    brandSlug: null,
    environmentSlug: 'production',
    storeHash: 'j6k7l8m9n0',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'B2B',
    masterSlug: 'acme-wholesale-emea',
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. Customer groups inherited from Acme Wholesale EMEA.',
    countryCode: 'US',
    currencyCode: 'USD',
    locale: 'en-US',
    timezone: 'America/Chicago',
    primaryDomain: 'trade.acme.com',
    platformPlan: 'Enterprise',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Trade',
    themeVersion: '2.6.0',
    themeHasLocalChanges: false,
    scale: 1.1,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes: 'Tax handling is delegated to an external provider, so tax configuration is read-only here.',
    channels: [
      { name: 'Trade US', externalId: 1, countryCode: 'US', currencyCode: 'USD', locale: 'en-US', siteUrl: 'https://trade.acme.com', status: 'active', isDefault: true },
    ],
    missingSkus: ['AH-CARE-GUIDE', 'AH-THROW-WOOL'],
    overriddenSkus: ['AS-CHAIR-ERG'],
    hiddenSkus: [],
    localOnlySkus: [],
  },
  {
    slug: 'acme-dealer-mea',
    name: 'Acme Dealer Portal MEA',
    companySlug: 'acme-wholesale',
    regionCode: 'EMEA',
    brandSlug: null,
    environmentSlug: 'production',
    storeHash: 'o1p2q3r4s5',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'DEALER',
    masterSlug: 'acme-wholesale-emea',
    status: 'DEGRADED',
    healthStatus: 'CRITICAL',
    healthMessage:
      'BigCommerce rejected the access token. The API account was regenerated in the control panel on 12 July and the new token has not been supplied.',
    countryCode: 'AE',
    currencyCode: 'AED',
    locale: 'en-AE',
    timezone: 'Asia/Dubai',
    primaryDomain: 'dealers.acme.ae',
    platformPlan: 'Pro',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Trade',
    themeVersion: '2.4.2',
    themeHasLocalChanges: true,
    scale: 0.3,
    lastSyncDaysAgo: 26,
    lastErrorSummary: '401 Unauthorized from GET /v2/store — the stored API account token is no longer valid.',
    notes:
      'Credential rotation is outstanding. Everything shown for this store is the last successful snapshot, not live data.',
    channels: [
      { name: 'Dealer Portal MEA', externalId: 1, countryCode: 'AE', currencyCode: 'AED', locale: 'en-AE', siteUrl: 'https://dealers.acme.ae', status: 'active', isDefault: true },
    ],
    missingSkus: ['AH-CARE-GUIDE', 'AH-THROW-WOOL', 'AH-RUG-200300', 'AS-MAT-DESK'],
    overriddenSkus: [],
    hiddenSkus: ['AF-GLOVE-WIN'],
    localOnlySkus: [],
  },

  // --- Acme Outlet ---------------------------------------------------------
  {
    slug: 'acme-outlet-uk',
    name: 'Acme Outlet UK',
    companySlug: 'acme-outlet',
    regionCode: 'UK',
    brandSlug: null,
    environmentSlug: 'production',
    storeHash: 't6u7v8w9x0',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INDEPENDENT',
    classification: 'OUTLET',
    masterSlug: null,
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. This store deliberately does not inherit from the consumer master.',
    countryCode: 'GB',
    currencyCode: 'GBP',
    locale: 'en-GB',
    timezone: 'Europe/London',
    primaryDomain: 'outlet.acme.co.uk',
    platformPlan: 'Pro',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Outlet',
    themeVersion: '1.8.3',
    themeHasLocalChanges: false,
    scale: 0.6,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes:
      'Operates autonomously by design: clearance pricing and merchandising must not be overwritten by the consumer master.',
    channels: [
      { name: 'Acme Outlet UK', externalId: 1, countryCode: 'GB', currencyCode: 'GBP', locale: 'en-GB', siteUrl: 'https://outlet.acme.co.uk', status: 'active', isDefault: true },
    ],
    missingSkus: ['AS-DESK-160', 'AS-CHAIR-ERG', 'AH-RUG-200300', 'AH-CARE-GUIDE'],
    overriddenSkus: ['AH-KETTLE-1000', 'AH-TOASTER-220', 'AF-BOOT-TRAIL', 'AF-GLOVE-WIN'],
    hiddenSkus: [],
    localOnlySkus: [
      { sku: 'AH-BUNDLE-CLEAR', name: 'Kitchen Clearance Bundle', price: 149 },
      { sku: 'AF-BUNDLE-CLEAR', name: 'Outdoor Clearance Bundle', price: 199 },
    ],
  },
  {
    slug: 'acme-outlet-nordics',
    name: 'Acme Outlet Nordics',
    companySlug: 'acme-outlet',
    regionCode: 'NORDICS',
    brandSlug: null,
    environmentSlug: 'production',
    storeHash: 'y1z2a3b4c5',
    connectionType: 'INDEPENDENT',
    hierarchyMode: 'INHERITED',
    classification: 'OUTLET',
    masterSlug: 'acme-outlet-uk',
    status: 'ACTIVE',
    healthStatus: 'WARNING',
    healthMessage:
      'Connected, but three products have diverged from Acme Outlet UK since the last deployment.',
    countryCode: 'SE',
    currencyCode: 'SEK',
    locale: 'sv-SE',
    timezone: 'Europe/Stockholm',
    primaryDomain: 'outlet.acme.se',
    platformPlan: 'Plus',
    msfEnabled: false,
    storefrontLimit: 1,
    storefrontsUsed: 1,
    themeName: 'Acme Outlet',
    themeVersion: '1.7.0',
    themeHasLocalChanges: false,
    scale: 0.25,
    lastSyncDaysAgo: 2,
    lastErrorSummary: null,
    notes: 'Inherits the outlet catalogue from Acme Outlet UK but prices independently in SEK.',
    channels: [
      { name: 'Acme Outlet Nordics', externalId: 1, countryCode: 'SE', currencyCode: 'SEK', locale: 'sv-SE', siteUrl: 'https://outlet.acme.se', status: 'active', isDefault: true },
    ],
    missingSkus: ['AS-DESK-160', 'AS-CHAIR-ERG', 'AH-RUG-200300', 'AH-CARE-GUIDE', 'AH-BOARD-END'],
    overriddenSkus: ['AH-KETTLE-1000'],
    hiddenSkus: ['AF-REPAIR-KIT'],
    localOnlySkus: [],
  },
  {
    slug: 'acme-uk-staging',
    name: 'Acme UK Staging',
    companySlug: 'acme-consumer',
    regionCode: 'UK',
    brandSlug: 'acme-home',
    environmentSlug: 'staging',
    storeHash: 'd6e7f8g9h0',
    connectionType: 'DEVELOPMENT',
    hierarchyMode: 'INHERITED',
    classification: 'INTERNAL',
    masterSlug: 'acme-uk-flagship',
    status: 'ACTIVE',
    healthStatus: 'HEALTHY',
    healthMessage: 'Connected. Used to rehearse deployments before they reach production.',
    countryCode: 'GB',
    currencyCode: 'GBP',
    locale: 'en-GB',
    timezone: 'Europe/London',
    primaryDomain: 'staging-acme.mybigcommerce.com',
    platformPlan: 'Sandbox',
    msfEnabled: true,
    storefrontLimit: 2,
    storefrontsUsed: 1,
    themeName: 'Acme Signature',
    themeVersion: '4.3.0-rc.1',
    themeHasLocalChanges: true,
    scale: 0.02,
    lastSyncDaysAgo: 0,
    lastErrorSummary: null,
    notes:
      'Runs the 4.3.0 release candidate. Deployments are rehearsed here first; order volume is negligible and not reported in group totals.',
    channels: [
      { name: 'Staging Storefront', externalId: 1, countryCode: 'GB', currencyCode: 'GBP', locale: 'en-GB', siteUrl: 'https://staging-acme.mybigcommerce.com', status: 'active', isDefault: true },
    ],
    missingSkus: [],
    overriddenSkus: [],
    hiddenSkus: [],
    localOnlySkus: [],
  },
];

export const SEED_STORE_GROUPS = [
  {
    slug: 'emea-consumer',
    name: 'EMEA Consumer',
    companySlug: 'acme-consumer',
    purpose: 'OPERATIONAL',
    description: 'Consumer stores trading in Europe, the Middle East and Africa.',
    colorHex: '#2563eb',
    storeSlugs: ['acme-uk-flagship', 'acme-germany'],
  },
  {
    slug: 'peak-season-wave-1',
    name: 'Peak Season Wave 1',
    companySlug: 'acme-consumer',
    purpose: 'DEPLOYMENT_TARGET',
    description:
      'First wave of stores to receive the peak-season theme and merchandising release. Deliberately excludes Japan while its theme version is behind.',
    colorHex: '#b45309',
    storeSlugs: ['acme-uk-flagship', 'acme-us', 'acme-canada', 'acme-australia'],
  },
  {
    slug: 'b2b-estate',
    name: 'B2B Estate',
    companySlug: 'acme-wholesale',
    purpose: 'REPORTING',
    description: 'Every trade and dealer store, for consolidated B2B reporting.',
    colorHex: '#0f766e',
    storeSlugs: ['acme-wholesale-emea', 'acme-wholesale-na', 'acme-dealer-mea'],
  },
  {
    slug: 'non-production',
    name: 'Non-production',
    companySlug: null,
    purpose: 'MIGRATION',
    description: 'Staging and development stores. Guard rails are relaxed and these are excluded from group revenue.',
    colorHex: '#64748b',
    storeSlugs: ['acme-uk-staging'],
  },
] as const;

export const SEED_CUSTOMER_GROUP_TEMPLATES = [
  {
    name: 'Retail',
    description: 'Default group for consumer shoppers. No discount, full catalogue access.',
    discountType: 'NONE' as const,
    discountValue: '0.00',
    isDefaultGroup: true,
    companySlug: 'acme-consumer',
  },
  {
    name: 'Trade Bronze',
    description: 'Entry trade tier. 10% off list, access to the full trade catalogue.',
    discountType: 'PERCENT' as const,
    discountValue: '10.00',
    isDefaultGroup: false,
    companySlug: 'acme-wholesale',
  },
  {
    name: 'Trade Silver',
    description: 'Mid trade tier. 18% off list plus early access to new ranges.',
    discountType: 'PERCENT' as const,
    discountValue: '18.00',
    isDefaultGroup: false,
    companySlug: 'acme-wholesale',
  },
  {
    name: 'Trade Gold',
    description: 'Top trade tier. 25% off list, negotiated freight and a dedicated account manager.',
    discountType: 'PERCENT' as const,
    discountValue: '25.00',
    isDefaultGroup: false,
    companySlug: 'acme-wholesale',
  },
  {
    name: 'Distributor',
    description: 'Distributor pricing driven by an assigned price list rather than a percentage discount.',
    discountType: 'PRICE_LIST' as const,
    discountValue: '0.00',
    isDefaultGroup: false,
    companySlug: 'acme-wholesale',
  },
] as const;
