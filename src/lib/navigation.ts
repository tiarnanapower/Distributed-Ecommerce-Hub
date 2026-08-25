import {
  Activity,
  BadgeCheck,
  Blocks,
  Boxes,
  Building2,
  Cog,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  Layers,
  type LucideIcon,
  Package,
  Palette,
  Receipt,
  RefreshCw,
  Rocket,
  ScrollText,
  Sparkles,
  Store,
  Tags,
  Users,
  Warehouse,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Short line shown in the command palette and collapsed tooltips. */
  description: string;
  /** Feature-flag key that must be enabled for this item to appear. */
  featureFlag?: string;
  /** Rendered but disabled when the flag is off, instead of hidden. */
  disabledWhenFlagOff?: boolean;
  badge?: 'conflicts' | 'jobs' | 'approvals';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Overview',
        href: '/overview',
        icon: LayoutDashboard,
        description: 'Executive dashboard across the whole estate',
      },
      {
        label: 'Analytics',
        href: '/analytics',
        icon: Activity,
        description: 'Revenue, store comparison, catalog and operations analytics',
      },
    ],
  },
  {
    label: 'Estate',
    items: [
      {
        label: 'Companies',
        href: '/companies',
        icon: Building2,
        description: 'Business units, regions and brands',
      },
      { label: 'Stores', href: '/stores', icon: Store, description: 'Every connected store and storefront' },
      {
        label: 'Store Groups',
        href: '/store-groups',
        icon: Layers,
        description: 'Groupings used to target deployments and comparisons',
      },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Catalog', href: '/catalog', icon: Package, description: 'Products across every store' },
      { label: 'Pricing', href: '/pricing', icon: Tags, description: 'Prices, price lists and local overrides' },
      { label: 'Inventory', href: '/inventory', icon: Warehouse, description: 'Stock levels and inventory strategy' },
      { label: 'Orders', href: '/orders', icon: Receipt, description: 'Unified order view across stores' },
      { label: 'Customers', href: '/customers', icon: Users, description: 'Store-scoped customer records' },
      {
        label: 'Customer Groups',
        href: '/customer-groups',
        icon: BadgeCheck,
        description: 'Group templates and their per-store mappings',
      },
      { label: 'Promotions', href: '/promotions', icon: Sparkles, description: 'Promotions and coupons by store' },
    ],
  },
  {
    label: 'Experience',
    items: [
      { label: 'Content', href: '/content', icon: FileText, description: 'Pages, widgets, scripts and redirects' },
      { label: 'Themes', href: '/themes', icon: Palette, description: 'Theme releases, assignments and rollout' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Deployments', href: '/deployments', icon: Rocket, description: 'Cross-store change workflow', badge: 'approvals' },
      { label: 'Sync Centre', href: '/sync', icon: RefreshCw, description: 'Job queue, progress and history', badge: 'jobs' },
      {
        label: 'Conflicts',
        href: '/conflicts',
        icon: GitCompareArrows,
        description: 'Configuration drift and its resolution',
        badge: 'conflicts',
      },
      { label: 'Integrations', href: '/integrations', icon: Blocks, description: 'Connector directory' },
      { label: 'Audit Log', href: '/audit', icon: ScrollText, description: 'Every meaningful action, recorded' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Settings', href: '/settings', icon: Cog, description: 'Organisation, policies and feature flags' },
      {
        label: 'Automation Assistant',
        href: '/automation-assistant',
        icon: Boxes,
        description: 'AI-assisted operations are not configured in this environment',
        featureFlag: 'automation-assistant',
        disabledWhenFlagOff: true,
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Store detail tabs, kept here so breadcrumbs and links stay in step. */
export const STORE_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'storefronts', label: 'Storefronts' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'content', label: 'Content' },
  { id: 'theme', label: 'Theme' },
  { id: 'orders', label: 'Orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'sync', label: 'Sync history' },
  { id: 'audit', label: 'Audit history' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'capabilities', label: 'Capabilities' },
] as const;

export type StoreTabId = (typeof STORE_TABS)[number]['id'];

export function isStoreTab(value: string): value is StoreTabId {
  return STORE_TABS.some((tab) => tab.id === value);
}

export const SETTINGS_SECTIONS = [
  { id: 'organisation', label: 'Organisation profile', href: '/settings' },
  { id: 'companies', label: 'Companies & regions', href: '/settings/companies' },
  { id: 'brands', label: 'Brands & environments', href: '/settings/brands' },
  { id: 'inheritance', label: 'Inheritance policies', href: '/settings/inheritance' },
  { id: 'approvals', label: 'Approval policies', href: '/settings/approvals' },
  { id: 'notifications', label: 'Notification preferences', href: '/settings/notifications' },
  { id: 'security', label: 'Credential encryption', href: '/settings/security' },
  { id: 'flags', label: 'Feature flags', href: '/settings/feature-flags' },
  { id: 'retention', label: 'Data retention', href: '/settings/retention' },
  { id: 'manual-actions', label: 'Manual actions', href: '/settings/manual-actions' },
  { id: 'developer', label: 'Developer settings', href: '/settings/developer' },
] as const;

/** Groups nav items for the command palette. */
export const COMMAND_NAV = NAV_GROUPS.map((group) => ({
  label: group.label,
  items: group.items.filter((item) => !item.featureFlag),
}));
