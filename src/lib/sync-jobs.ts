/**
 * The job types a user can start by hand from the Sync Centre.
 *
 * Kept out of the server-action module for two reasons: a `'use server'` file
 * may only export async functions, and the dialog that renders these is a
 * client component that must not pull Prisma into the browser bundle.
 *
 * Deployment job types are deliberately absent. Those only ever run through the
 * deployment workflow, so they cannot bypass its dry-run and confirmation.
 */
export const RUNNABLE_JOB_TYPES = [
  'CONNECTION_REFRESH',
  'CHANNEL_DISCOVERY',
  'CATALOG_PULL',
  'ORDER_PULL',
  'CUSTOMER_PULL',
  'ANALYTICS_REFRESH',
] as const;

export type RunnableJobType = (typeof RUNNABLE_JOB_TYPES)[number];

/** What each job actually does, shown next to the option in the UI. */
export const RUNNABLE_JOB_DESCRIPTIONS: Record<RunnableJobType, string> = {
  CONNECTION_REFRESH:
    'Re-reads store profile, plan, currency, domain and Multi-Storefront status. Fast, and the right first step after connecting.',
  CHANNEL_DISCOVERY:
    'Reads the store’s channels and their sites, recording each storefront and its URL.',
  CATALOG_PULL:
    'Captures a product snapshot for every product. This is what the catalog matrix and drift detection read.',
  ORDER_PULL: 'Captures order snapshots and their line items. Personal data is masked at the boundary.',
  CUSTOMER_PULL:
    'Captures customer snapshots and the store’s customer groups. Only a masked email and a keyed hash are stored.',
  ANALYTICS_REFRESH:
    'Recomputes the cached headline metrics from existing snapshots. Does not call BigCommerce.',
};

/** The scope each job needs. Shown so a permission failure is predictable. */
export const RUNNABLE_JOB_SCOPES: Record<RunnableJobType, string | null> = {
  CONNECTION_REFRESH: 'store_v2_information_read_only',
  CHANNEL_DISCOVERY: 'store_channel_settings_read_only',
  CATALOG_PULL: 'store_v2_products_read_only',
  ORDER_PULL: 'store_v2_orders_read_only',
  CUSTOMER_PULL: 'store_v2_customers_read_only',
  ANALYTICS_REFRESH: null,
};

/** A sensible order to run these in when someone asks for "everything". */
export const FULL_SYNC_SEQUENCE: RunnableJobType[] = [
  'CONNECTION_REFRESH',
  'CHANNEL_DISCOVERY',
  'CATALOG_PULL',
  'ORDER_PULL',
  'CUSTOMER_PULL',
  'ANALYTICS_REFRESH',
];

/** Maps the `?action=` shorthand on incoming links to a job selection. */
export function jobTypesForAction(action: string | undefined): RunnableJobType[] {
  switch (action) {
    case 'catalog':
      return ['CATALOG_PULL'];
    case 'orders':
      return ['ORDER_PULL'];
    case 'customers':
      return ['CUSTOMER_PULL'];
    case 'channels':
      return ['CHANNEL_DISCOVERY'];
    case 'refresh':
      return ['CONNECTION_REFRESH'];
    case 'full':
      return [...FULL_SYNC_SEQUENCE];
    default:
      return [];
  }
}
