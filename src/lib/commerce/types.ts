/**
 * The commerce domain types that the rest of the application depends on.
 *
 * These are deliberately *our* types, not BigCommerce response shapes. The
 * BigCommerce provider maps API payloads into these; the demo provider
 * synthesises them. Business logic never sees a raw API response.
 */
import type { CapabilityKey } from '@/lib/commerce/capability-keys';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number | null;
  totalPages: number | null;
  hasMore: boolean;
  /** Cursor for APIs that do not expose a total. */
  nextCursor?: string | null;
}

export function emptyPage<T>(pageSize = 50): Paginated<T> {
  return { items: [], page: 1, pageSize, totalItems: 0, totalPages: 0, hasMore: false };
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export interface ConnectionResult {
  ok: boolean;
  /** Milliseconds for the probe request. */
  latencyMs: number;
  /** Scopes the token actually presented, when the API reports them. */
  grantedScopes: string[];
  /** Scopes this platform needs that the token does not have. */
  missingScopes: string[];
  storeName?: string;
  storeHash?: string;
  /** Human-readable explanation, safe to show. Never contains the token. */
  message: string;
  /** Set when the probe failed. */
  errorCode?: string;
  checkedAt: Date;
  /** True when the result came from the demo provider. */
  isSimulated: boolean;
}

export interface StoreInfo {
  storeHash: string;
  name: string;
  domain: string | null;
  secureUrl: string | null;
  controlPanelUrl: string | null;
  status: string | null;
  currencyCode: string;
  currencySymbol: string | null;
  weightUnits: string | null;
  timezoneName: string | null;
  language: string | null;
  countryCode: string | null;
  planName: string | null;
  planLevel: string | null;
  /** Whether the store reports Multi-Storefront support. */
  multiStorefrontEnabled: boolean | null;
  /** Storefront seats, when the store reports them. */
  storefrontLimit: number | null;
  activeComparisonModules?: string[];
  features: Record<string, string | number | boolean | null>;
  isSimulated: boolean;
}

export interface Channel {
  id: number;
  name: string;
  platform: string;
  type: string;
  status: string;
  isListableFromUi: boolean;
  isVisible: boolean;
  externalId: string | null;
  siteUrl: string | null;
  siteId: number | null;
  currencyCode: string | null;
  locale: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface ProductQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sku?: string;
  categoryId?: number;
  brandId?: number;
  channelId?: number;
  isVisible?: boolean;
  sort?: 'name' | 'sku' | 'price' | 'date_modified' | 'inventory_level';
  direction?: 'asc' | 'desc';
  include?: ('variants' | 'images' | 'custom_fields' | 'options')[];
}

export interface ProductImage {
  id: number;
  url: string;
  isThumbnail: boolean;
  description: string | null;
}

export interface ProductVariant {
  id: number;
  sku: string;
  price: string | null;
  costPrice: string | null;
  inventoryLevel: number | null;
  optionLabel: string;
}

export interface CustomField {
  id: number | null;
  name: string;
  value: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  type: string;
  /** Exact decimal strings, always paired with the store's currency. */
  price: string;
  salePrice: string | null;
  retailPrice: string | null;
  costPrice: string | null;
  currencyCode: string;
  weight: string | null;
  isVisible: boolean;
  availability: string;
  inventoryLevel: number | null;
  inventoryTracking: string;
  brandId: number | null;
  brandName: string | null;
  categories: number[];
  categoryNames: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  customFields: CustomField[];
  pageTitle: string | null;
  metaDescription: string | null;
  /** Channel ids this product is assigned to, when the API exposes them. */
  channelIds: number[];
  dateModified: Date | null;
  dateCreated: Date | null;
}

export interface Category {
  id: number;
  parentId: number;
  treeId: number | null;
  name: string;
  path: string;
  isVisible: boolean;
  productCount: number | null;
  sortOrder: number;
}

export interface Brand {
  id: number;
  name: string;
  pageTitle: string | null;
  imageUrl: string | null;
  productCount: number | null;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PriceList {
  id: number;
  name: string;
  active: boolean;
  dateCreated: Date | null;
  dateModified: Date | null;
}

export interface PriceRecord {
  priceListId: number;
  variantId: number;
  sku: string | null;
  currency: string;
  price: string;
  salePrice: string | null;
  retailPrice: string | null;
  mapPrice: string | null;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryLocation {
  id: number;
  code: string;
  label: string;
  enabled: boolean;
  typeId: string | null;
  countryCode: string | null;
}

export interface InventoryItem {
  locationId: number | null;
  productId: number;
  variantId: number | null;
  sku: string;
  availableToSell: number | null;
  totalInventory: number | null;
  safetyStock: number | null;
  isInStock: boolean;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  statusId?: number;
  channelId?: number;
  customerId?: number;
  minDateCreated?: Date;
  maxDateCreated?: Date;
  search?: string;
  sort?: 'date_created' | 'id' | 'total_inc_tax';
  direction?: 'asc' | 'desc';
}

export interface OrderLine {
  id: number;
  productId: number | null;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  total: string;
  variantLabel: string | null;
}

export interface OrderAddressSummary {
  /** Personal data is fetched on demand and is not persisted by the platform. */
  name: string | null;
  company: string | null;
  city: string | null;
  stateOrProvince: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

export interface Order {
  id: number;
  orderNumber: string;
  statusLabel: string;
  statusId: number | null;
  currencyCode: string;
  subtotal: string;
  shippingTotal: string;
  taxTotal: string;
  discountTotal: string;
  grandTotal: string;
  refundedTotal: string;
  itemCount: number;
  customerId: number | null;
  customerName: string | null;
  /** Always masked at the provider boundary. */
  customerEmailMasked: string | null;
  channelId: number | null;
  paymentMethod: string | null;
  paymentStatus: string;
  countryCode: string | null;
  staffNotes: string | null;
  dateCreated: Date;
  dateModified: Date | null;
  lines: OrderLine[];
  billingAddress: OrderAddressSummary | null;
  shippingAddresses: OrderAddressSummary[];
  isRefunded: boolean;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  customerGroupId?: number;
  channelId?: number;
}

export interface Customer {
  id: number;
  firstName: string | null;
  lastName: string | null;
  /** Masked at the boundary; the raw value is only ever held in memory. */
  emailMasked: string;
  phoneMasked: string | null;
  company: string | null;
  customerGroupId: number | null;
  customerGroupName: string | null;
  storeCredit: string;
  currencyCode: string;
  acceptsMarketing: boolean;
  channelIds: number[];
  dateCreated: Date | null;
  dateModified: Date | null;
}

export interface CustomerGroup {
  id: number;
  name: string;
  isDefault: boolean;
  discountType: string;
  discountAmount: string;
  categoryAccessType: string;
  categoryIds: number[];
  memberCount: number | null;
}

// ---------------------------------------------------------------------------
// Content and themes
// ---------------------------------------------------------------------------

export interface Page {
  id: number;
  name: string;
  type: string;
  url: string | null;
  isVisible: boolean;
  channelId: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface Widget {
  uuid: string;
  name: string;
  widgetTemplateUuid: string;
  channelId: number | null;
  dateModified: Date | null;
}

export interface Redirect {
  id: number;
  fromPath: string;
  toUrl: string;
  siteId: number | null;
}

export interface StorefrontScript {
  uuid: string;
  name: string;
  location: string;
  visibility: string;
  channelId: number | null;
  kind: string;
}

export interface Theme {
  uuid: string;
  name: string;
  version: string;
  isPrivate: boolean;
  isActive: boolean;
  variations: { uuid: string; name: string; isCurrent: boolean }[];
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export interface Promotion {
  id: number;
  name: string;
  status: string;
  redemptionType: string;
  couponCode: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  currentUses: number | null;
  maxUses: number | null;
  channelIds: number[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Anything that can answer questions about one store. Application services
 * depend on this and never on `fetch`.
 *
 * Methods that mutate state are intentionally *not* on the base interface:
 * writes are gated by the capability registry and live on `WritableCommerce
 * Provider`, so a read-only code path cannot accidentally call one.
 */
export interface CommerceProvider {
  readonly kind: 'bigcommerce' | 'demo';
  readonly connectionId: string;
  /** True when nothing this provider returns came from a live store. */
  readonly isSimulated: boolean;

  testConnection(): Promise<ConnectionResult>;
  getStoreInfo(): Promise<StoreInfo>;
  listChannels(): Promise<Channel[]>;

  listProducts(params: ProductQuery): Promise<Paginated<Product>>;
  getProduct(id: number): Promise<Product>;
  listCategories(params?: { channelId?: number }): Promise<Category[]>;
  listBrands(): Promise<Brand[]>;

  listPriceLists(): Promise<PriceList[]>;
  listPriceRecords(priceListId: number): Promise<PriceRecord[]>;

  listInventoryLocations(): Promise<InventoryLocation[]>;
  listInventory(params?: { locationId?: number; page?: number; pageSize?: number }): Promise<Paginated<InventoryItem>>;

  listOrders(params: OrderQuery): Promise<Paginated<Order>>;
  getOrder(id: number): Promise<Order>;

  listCustomers(params: CustomerQuery): Promise<Paginated<Customer>>;
  listCustomerGroups(): Promise<CustomerGroup[]>;

  listPages(params?: { channelId?: number }): Promise<Page[]>;
  listWidgets(params?: { channelId?: number }): Promise<Widget[]>;
  listRedirects(params?: { siteId?: number }): Promise<Redirect[]>;
  listScripts(params?: { channelId?: number }): Promise<StorefrontScript[]>;
  listThemes(): Promise<Theme[]>;

  listPromotions(): Promise<Promotion[]>;

  /** Which capabilities this provider believes are usable right now. */
  probeCapabilities(): Promise<CapabilityProbeResult[]>;
}

export interface CapabilityProbeResult {
  key: CapabilityKey;
  status: 'AVAILABLE' | 'READ_ONLY' | 'PERMISSION_MISSING' | 'PLAN_DEPENDENT' | 'MANUAL_ACTION' | 'NOT_SUPPORTED' | 'NOT_IMPLEMENTED';
  reason?: string;
  verifiedAt: Date;
  source: 'STATIC_REGISTRY' | 'SCOPE_PROBE' | 'LIVE_PROBE' | 'DEMO';
}

/** Masks an email for display and storage: `a****e@example.com`. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  if (!domain || !local) return '••••';
  const visible = local.length <= 2 ? local.charAt(0) : `${local.charAt(0)}${'*'.repeat(Math.min(local.length - 2, 6))}${local.charAt(local.length - 1)}`;
  return `${visible}@${domain}`;
}

/** Masks a phone number, keeping only the final three digits. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 3) return '•••';
  return `••• ••• ${digits.slice(-3)}`;
}
