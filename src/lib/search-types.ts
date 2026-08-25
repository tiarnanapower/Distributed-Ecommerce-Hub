/**
 * Search result shapes shared between the API route and the command palette.
 *
 * Kept out of the search service so the client bundle does not import Prisma.
 */
export type SearchEntity =
  | 'store'
  | 'channel'
  | 'product'
  | 'order'
  | 'customer'
  | 'customer_group'
  | 'job'
  | 'deployment'
  | 'audit'
  | 'page'
  | 'theme';

export interface SearchResult {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export const SEARCH_ENTITY_LABELS: Record<SearchEntity, string> = {
  store: 'Stores',
  channel: 'Storefronts',
  product: 'Products',
  order: 'Orders',
  customer: 'Customers',
  customer_group: 'Customer groups',
  job: 'Jobs',
  deployment: 'Deployments',
  audit: 'Audit events',
  page: 'Pages',
  theme: 'Themes',
};
