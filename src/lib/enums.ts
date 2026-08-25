/**
 * Enumerated values.
 *
 * SQLite cannot express Prisma `enum` types, so every enumerated column in the
 * schema is a plain `String`. This module is the single source of truth for the
 * permitted values: it exports a runtime tuple (for Zod and for UI iteration)
 * and a derived TypeScript union for each one.
 *
 * When migrating to PostgreSQL these can become native enums without touching
 * any calling code.
 */

function makeEnum<const T extends readonly string[]>(values: T) {
  return values;
}

// --- Identity ---------------------------------------------------------------

export const USER_ROLES = makeEnum([
  'ORGANISATION_OWNER',
  'COMPANY_ADMIN',
  'REGIONAL_MANAGER',
  'STORE_MANAGER',
  'ANALYST',
  'READ_ONLY',
  'INTEGRATION_ADMIN',
] as const);
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ORGANISATION_OWNER: 'Organisation Owner',
  COMPANY_ADMIN: 'Company Admin',
  REGIONAL_MANAGER: 'Regional Manager',
  STORE_MANAGER: 'Store Manager',
  ANALYST: 'Analyst',
  READ_ONLY: 'Read-only User',
  INTEGRATION_ADMIN: 'Integration Administrator',
};

// --- Organisation -----------------------------------------------------------

export const BUSINESS_MODELS = makeEnum([
  'B2C',
  'B2B',
  'HYBRID',
  'WHOLESALE',
  'OUTLET',
  'DEALER',
  'FRANCHISE',
] as const);
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const GUARDRAIL_LEVELS = makeEnum(['STRICT', 'STANDARD', 'RELAXED'] as const);
export type GuardrailLevel = (typeof GUARDRAIL_LEVELS)[number];

export const GROUP_PURPOSES = makeEnum([
  'OPERATIONAL',
  'DEPLOYMENT_TARGET',
  'REPORTING',
  'MIGRATION',
] as const);
export type GroupPurpose = (typeof GROUP_PURPOSES)[number];

// --- Stores -----------------------------------------------------------------

export const CONNECTION_TYPES = makeEnum([
  'INDEPENDENT',
  'MSF_PARENT',
  'CHANNEL_CONNECTION',
  'DEVELOPMENT',
  'SANDBOX',
] as const);
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  INDEPENDENT: 'Independent store',
  MSF_PARENT: 'Multi-Storefront parent',
  CHANNEL_CONNECTION: 'Storefront channel',
  DEVELOPMENT: 'Development store',
  SANDBOX: 'Sandbox or test connection',
};

export const HIERARCHY_MODES = makeEnum([
  'INDEPENDENT',
  'MASTER',
  'INHERITED',
  'TEMPLATE_BASED',
  'MSF_PARENT',
  'MSF_CHANNEL',
] as const);
export type HierarchyMode = (typeof HIERARCHY_MODES)[number];

export const HIERARCHY_MODE_LABELS: Record<HierarchyMode, string> = {
  INDEPENDENT: 'Independent',
  MASTER: 'Master',
  INHERITED: 'Inherited',
  TEMPLATE_BASED: 'Template-based',
  MSF_PARENT: 'Multi-Storefront parent',
  MSF_CHANNEL: 'Multi-Storefront channel',
};

export const STORE_CLASSIFICATIONS = makeEnum([
  'B2C',
  'B2B',
  'DEALER',
  'FRANCHISE',
  'OUTLET',
  'WHOLESALE',
  'INTERNAL',
] as const);
export type StoreClassification = (typeof STORE_CLASSIFICATIONS)[number];

export const CONNECTION_STATUSES = makeEnum([
  'PLANNED',
  'CONNECTING',
  'ACTIVE',
  'DEGRADED',
  'DISCONNECTED',
  'ARCHIVED',
] as const);
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const HEALTH_STATUSES = makeEnum(['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN'] as const);
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const RELATIONSHIP_TYPES = makeEnum([
  'MASTER_CHILD',
  'TEMPLATE_APPLIED',
  'MSF_PARENT_CHANNEL',
  'PEER_COMPARISON',
] as const);
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const CHANNEL_STATUSES = makeEnum([
  'active',
  'prelaunch',
  'inactive',
  'connected',
  'disconnected',
  'terminated',
  'archived',
] as const);
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

// --- Inheritance ------------------------------------------------------------

export const INHERITANCE_MODES = makeEnum([
  'DO_NOT_INHERIT',
  'INHERIT_CONTINUOUS',
  'COPY_ONCE',
  'INHERIT_WITH_OVERRIDES',
  'REQUIRE_APPROVAL',
  'READ_ONLY_COMPARISON',
] as const);
export type InheritanceMode = (typeof INHERITANCE_MODES)[number];

export const INHERITANCE_MODE_LABELS: Record<InheritanceMode, string> = {
  DO_NOT_INHERIT: 'Do not inherit',
  INHERIT_CONTINUOUS: 'Inherit continuously',
  COPY_ONCE: 'Copy once',
  INHERIT_WITH_OVERRIDES: 'Inherit with local overrides',
  REQUIRE_APPROVAL: 'Require approval before updates',
  READ_ONLY_COMPARISON: 'Read-only comparison',
};

export const INHERITANCE_MODE_DESCRIPTIONS: Record<InheritanceMode, string> = {
  DO_NOT_INHERIT: 'The store manages this resource entirely on its own.',
  INHERIT_CONTINUOUS: 'Source changes flow to the store on every sync. Local edits are reverted.',
  COPY_ONCE: 'The source value seeds the store once, then the two diverge freely.',
  INHERIT_WITH_OVERRIDES:
    'The source value applies unless the store has recorded a deliberate override.',
  REQUIRE_APPROVAL: 'Source changes are queued for approval before they reach the store.',
  READ_ONLY_COMPARISON: 'Differences are reported but nothing is ever written to the store.',
};

export const POLICY_SCOPE_TYPES = makeEnum([
  'ORGANISATION',
  'COMPANY',
  'REGION',
  'STORE_GROUP',
  'STORE',
] as const);
export type PolicyScopeType = (typeof POLICY_SCOPE_TYPES)[number];

export const INHERITANCE_SOURCE_TYPES = makeEnum([
  'MASTER_STORE',
  'TEMPLATE',
  'ORGANISATION_DEFAULT',
  'COMPANY_DEFAULT',
] as const);
export type InheritanceSourceType = (typeof INHERITANCE_SOURCE_TYPES)[number];

export const OVERRIDE_STATUSES = makeEnum([
  'ACTIVE',
  'PENDING_APPROVAL',
  'REVERTED',
  'SUPERSEDED',
] as const);
export type OverrideStatus = (typeof OVERRIDE_STATUSES)[number];

// --- Capabilities -----------------------------------------------------------

export const CAPABILITY_STATUSES = makeEnum([
  'AVAILABLE',
  'READ_ONLY',
  'PERMISSION_MISSING',
  'PLAN_DEPENDENT',
  'MANUAL_ACTION',
  'NOT_SUPPORTED',
  'NOT_IMPLEMENTED',
] as const);
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  AVAILABLE: 'Available',
  READ_ONLY: 'Read-only',
  PERMISSION_MISSING: 'Permission missing',
  PLAN_DEPENDENT: 'Plan-dependent',
  MANUAL_ACTION: 'Manual action',
  NOT_SUPPORTED: 'Not supported',
  NOT_IMPLEMENTED: 'Not yet implemented',
};

export const VERIFICATION_SOURCES = makeEnum([
  'STATIC_REGISTRY',
  'SCOPE_PROBE',
  'LIVE_PROBE',
  'DEMO',
] as const);
export type VerificationSource = (typeof VERIFICATION_SOURCES)[number];

// --- Credentials ------------------------------------------------------------

export const CREDENTIAL_TYPES = makeEnum([
  'API_ACCOUNT_TOKEN',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'WEBHOOK_SECRET',
] as const);
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_STATUSES = makeEnum([
  'ACTIVE',
  'ROTATED',
  'REVOKED',
  'INVALID',
  'UNVERIFIED',
] as const);
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

// --- Jobs and deployments ---------------------------------------------------

export const JOB_TYPES = makeEnum([
  'CONNECTION_REFRESH',
  'STORE_METADATA_SYNC',
  'CHANNEL_DISCOVERY',
  'CATALOG_PULL',
  'ORDER_PULL',
  'CUSTOMER_PULL',
  'CATALOG_DEPLOYMENT',
  'PRICING_DEPLOYMENT',
  'INVENTORY_DEPLOYMENT',
  'CONTENT_DEPLOYMENT',
  'THEME_DEPLOYMENT',
  'CUSTOMER_GROUP_DEPLOYMENT',
  'ANALYTICS_REFRESH',
  'COMPARISON_SCAN',
  'DRIFT_DETECTION',
] as const);
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  CONNECTION_REFRESH: 'Connection refresh',
  STORE_METADATA_SYNC: 'Store metadata sync',
  CHANNEL_DISCOVERY: 'Channel discovery',
  CATALOG_PULL: 'Catalog pull',
  ORDER_PULL: 'Order pull',
  CUSTOMER_PULL: 'Customer pull',
  CATALOG_DEPLOYMENT: 'Catalog deployment',
  PRICING_DEPLOYMENT: 'Pricing deployment',
  INVENTORY_DEPLOYMENT: 'Inventory deployment',
  CONTENT_DEPLOYMENT: 'Content deployment',
  THEME_DEPLOYMENT: 'Theme deployment',
  CUSTOMER_GROUP_DEPLOYMENT: 'Customer-group deployment',
  ANALYTICS_REFRESH: 'Analytics refresh',
  COMPARISON_SCAN: 'Comparison scan',
  DRIFT_DETECTION: 'Drift detection',
};

export const JOB_STATUSES = makeEnum([
  'DRAFT',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'AWAITING_APPROVAL',
] as const);
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  PARTIAL: 'Partially completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  AWAITING_APPROVAL: 'Awaiting approval',
};

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
];

export const ITEM_ACTIONS = makeEnum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'SKIP',
  'NO_CHANGE',
  'MANUAL',
] as const);
export type ItemAction = (typeof ITEM_ACTIONS)[number];

export const ITEM_STATUSES = makeEnum([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
  'BLOCKED',
] as const);
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const DEPLOYMENT_STATUSES = makeEnum([
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'ROLLED_BACK',
] as const);
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  PARTIAL: 'Partially completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  ROLLED_BACK: 'Rolled back',
};

export const DEPLOYMENT_STRATEGIES = makeEnum([
  'COPY_ONCE',
  'SYNC',
  'OVERWRITE',
  'ADDITIVE_ONLY',
] as const);
export type DeploymentStrategy = (typeof DEPLOYMENT_STRATEGIES)[number];

export const CHANGE_TYPES = makeEnum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'NO_CHANGE',
  'UNSUPPORTED',
  'MANUAL',
] as const);
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const RISK_LEVELS = makeEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const);
export type RiskLevel = (typeof RISK_LEVELS)[number];

// --- Approvals --------------------------------------------------------------

export const APPROVAL_SUBJECT_TYPES = makeEnum([
  'DEPLOYMENT',
  'RESOURCE_OVERRIDE',
  'CONFLICT_RESOLUTION',
  'THEME_RELEASE',
  'CUSTOMER_GROUP_TEMPLATE',
  'CREDENTIAL_ROTATION',
] as const);
export type ApprovalSubjectType = (typeof APPROVAL_SUBJECT_TYPES)[number];

export const APPROVAL_STATUSES = makeEnum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const);
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// --- Conflicts --------------------------------------------------------------

export const CONFLICT_TYPES = makeEnum([
  'MISSING_IN_TARGET',
  'EXTRA_IN_TARGET',
  'VALUE_MISMATCH',
  'LOCAL_OVERRIDE',
  'SOURCE_CHANGED_AFTER_OVERRIDE',
  'UNSUPPORTED_TARGET_CAPABILITY',
  'PERMISSION_MISSING',
  'INVALID_MAPPING',
  'DEPLOYMENT_FAILURE',
] as const);
export type ConflictType = (typeof CONFLICT_TYPES)[number];

export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  MISSING_IN_TARGET: 'Missing in target',
  EXTRA_IN_TARGET: 'Extra in target',
  VALUE_MISMATCH: 'Value mismatch',
  LOCAL_OVERRIDE: 'Local override',
  SOURCE_CHANGED_AFTER_OVERRIDE: 'Source changed after local override',
  UNSUPPORTED_TARGET_CAPABILITY: 'Unsupported target capability',
  PERMISSION_MISSING: 'Permission missing',
  INVALID_MAPPING: 'Invalid mapping',
  DEPLOYMENT_FAILURE: 'Deployment failure',
};

export const CONFLICT_STATUSES = makeEnum([
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'ACCEPTED_VARIANCE',
  'EXCLUDED',
  'MANUAL_REVIEW',
] as const);
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const RESOLUTION_ACTIONS = makeEnum([
  'KEEP_MASTER',
  'KEEP_LOCAL',
  'COPY_MASTER_ONCE',
  'RE_ENABLE_INHERITANCE',
  'ACCEPT_VARIANCE',
  'EXCLUDE_FROM_COMPARISON',
  'MANUAL_REVIEW',
] as const);
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

export const RESOLUTION_ACTION_LABELS: Record<ResolutionAction, string> = {
  KEEP_MASTER: 'Keep master',
  KEEP_LOCAL: 'Keep local',
  COPY_MASTER_ONCE: 'Copy master once',
  RE_ENABLE_INHERITANCE: 'Re-enable inheritance',
  ACCEPT_VARIANCE: 'Mark as accepted variance',
  EXCLUDE_FROM_COMPARISON: 'Exclude from future comparison',
  MANUAL_REVIEW: 'Require manual review',
};

// --- Mappings ---------------------------------------------------------------

export const MAPPING_STATUSES = makeEnum([
  'MAPPED',
  'MISSING_IN_TARGET',
  'EXTRA_IN_TARGET',
  'AMBIGUOUS',
  'MANUAL',
  'EXCLUDED',
] as const);
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const MATCH_STRATEGIES = makeEnum(['SKU', 'EXTERNAL_ID', 'NAME', 'MANUAL'] as const);
export type MatchStrategy = (typeof MATCH_STRATEGIES)[number];

export const CUSTOMER_GROUP_MAPPING_STATUSES = makeEnum([
  'MAPPED',
  'MISSING_IN_TARGET',
  'NAME_CONFLICT',
  'PENDING_DEPLOY',
  'DEPLOYED',
  'UNMANAGED',
] as const);
export type CustomerGroupMappingStatus = (typeof CUSTOMER_GROUP_MAPPING_STATUSES)[number];

// --- Catalog / commerce -----------------------------------------------------

export const PRICE_ORIGINS = makeEnum([
  'BASE',
  'PRICE_LIST',
  'LOCAL_OVERRIDE',
  'INHERITED_COPY',
  'CALCULATED_DISPLAY',
] as const);
export type PriceOrigin = (typeof PRICE_ORIGINS)[number];

export const PRICE_ORIGIN_LABELS: Record<PriceOrigin, string> = {
  BASE: 'Base price',
  PRICE_LIST: 'Price-list assignment',
  LOCAL_OVERRIDE: 'Locally overridden',
  INHERITED_COPY: 'Copied from source',
  CALCULATED_DISPLAY: 'Calculated display value',
};

export const STOCK_STATUSES = makeEnum([
  'IN_STOCK',
  'LOW',
  'OUT_OF_STOCK',
  'BACKORDER',
  'NOT_TRACKED',
] as const);
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const INVENTORY_STRATEGIES = makeEnum([
  'INDEPENDENT',
  'MASTER_SOURCE',
  'COPIED_SNAPSHOT',
  'EXTERNAL_SYSTEM',
  'READ_ONLY_REPORTING',
  'SHARED_POLICY_LOCAL_QTY',
] as const);
export type InventoryStrategy = (typeof INVENTORY_STRATEGIES)[number];

export const INVENTORY_STRATEGY_LABELS: Record<InventoryStrategy, string> = {
  INDEPENDENT: 'Independent per store',
  MASTER_SOURCE: 'Master inventory source',
  COPIED_SNAPSHOT: 'Copied snapshot',
  EXTERNAL_SYSTEM: 'External inventory system',
  READ_ONLY_REPORTING: 'Read-only reporting',
  SHARED_POLICY_LOCAL_QTY: 'Shared policy with local quantities',
};

export const ORDER_STATUS_CATEGORIES = makeEnum([
  'PENDING',
  'PROCESSING',
  'FULFILLED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
] as const);
export type OrderStatusCategory = (typeof ORDER_STATUS_CATEGORIES)[number];

export const CUSTOMER_STATUSES = makeEnum([
  'ACTIVE',
  'DISABLED',
  'GUEST',
  'PENDING_VALIDATION',
] as const);
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const PROMOTION_TYPES = makeEnum([
  'CART_LEVEL',
  'PRODUCT_LEVEL',
  'SHIPPING',
  'COUPON',
  'AUTOMATIC',
] as const);
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_STATUSES = makeEnum([
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED',
] as const);
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

// --- Content and themes -----------------------------------------------------

export const CONTENT_TYPES = makeEnum([
  'PAGE',
  'NAVIGATION',
  'WIDGET',
  'BANNER',
  'SCRIPT',
  'REDIRECT',
  'SEO',
  'BLOG',
] as const);
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  PAGE: 'Web page',
  NAVIGATION: 'Navigation',
  WIDGET: 'Widget',
  BANNER: 'Banner',
  SCRIPT: 'Script',
  REDIRECT: 'Redirect',
  SEO: 'SEO metadata',
  BLOG: 'Blog',
};

export const CONTENT_STATUSES = makeEnum([
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'ARCHIVED',
] as const);
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_SCOPE_LEVELS = makeEnum([
  'GLOBAL',
  'COMPANY',
  'REGION',
  'BRAND',
  'STORE',
  'CHANNEL',
] as const);
export type ContentScopeLevel = (typeof CONTENT_SCOPE_LEVELS)[number];

export const THEME_RELEASE_STATUSES = makeEnum([
  'DRAFT',
  'MANAGED',
  'PUBLISHED',
  'DEPRECATED',
] as const);
export type ThemeReleaseStatus = (typeof THEME_RELEASE_STATUSES)[number];

export const THEME_ASSIGNMENT_STATES = makeEnum([
  'ACTIVE',
  'DRAFT',
  'PENDING_DEPLOY',
  'FAILED',
  'ROLLED_BACK',
  'UNMANAGED',
] as const);
export type ThemeAssignmentState = (typeof THEME_ASSIGNMENT_STATES)[number];

export const THEME_LOCAL_CHANGE_RESOLUTIONS = makeEnum([
  'PRESERVE_LOCAL',
  'REPLACE_WITH_MANAGED',
  'DOWNLOAD_COMPARISON',
  'MARK_FOR_DEVELOPER_REVIEW',
] as const);
export type ThemeLocalChangeResolution = (typeof THEME_LOCAL_CHANGE_RESOLUTIONS)[number];

export const THEME_LOCAL_CHANGE_RESOLUTION_LABELS: Record<ThemeLocalChangeResolution, string> = {
  PRESERVE_LOCAL: 'Preserve local version',
  REPLACE_WITH_MANAGED: 'Replace with managed version',
  DOWNLOAD_COMPARISON: 'Download comparison',
  MARK_FOR_DEVELOPER_REVIEW: 'Mark for developer review',
};

// --- Platform ---------------------------------------------------------------

export const SEVERITIES = makeEnum(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const);
export type Severity = (typeof SEVERITIES)[number];

export const NOTIFICATION_TYPES = makeEnum([
  'CONNECTION_FAILURE',
  'TOKEN_INVALID',
  'MISSING_PERMISSION',
  'SYNC_FAILURE',
  'DEPLOYMENT_COMPLETED',
  'DEPLOYMENT_PARTIAL',
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'STORE_DRIFT_DETECTED',
  'LOW_INVENTORY',
  'THEME_MISMATCH',
  'STORE_UNAVAILABLE',
  'MANUAL_ACTION_REQUIRED',
] as const);
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  CONNECTION_FAILURE: 'Connection failure',
  TOKEN_INVALID: 'Token invalid',
  MISSING_PERMISSION: 'Missing permission',
  SYNC_FAILURE: 'Sync failure',
  DEPLOYMENT_COMPLETED: 'Deployment completed',
  DEPLOYMENT_PARTIAL: 'Deployment partially completed',
  APPROVAL_REQUESTED: 'Approval requested',
  APPROVAL_GRANTED: 'Approval granted',
  STORE_DRIFT_DETECTED: 'Store drift detected',
  LOW_INVENTORY: 'Low inventory',
  THEME_MISMATCH: 'Theme mismatch',
  STORE_UNAVAILABLE: 'Store unavailable',
  MANUAL_ACTION_REQUIRED: 'Manual action required',
};

export const AUDIT_OUTCOMES = makeEnum([
  'SUCCESS',
  'FAILURE',
  'PARTIAL',
  'BLOCKED',
  'DRY_RUN',
] as const);
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const ACTOR_TYPES = makeEnum(['USER', 'SYSTEM', 'JOB', 'INTEGRATION'] as const);
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ROLLOUT_STAGES = makeEnum(['GA', 'BETA', 'EXPERIMENTAL', 'DISABLED'] as const);
export type RolloutStage = (typeof ROLLOUT_STAGES)[number];

export const CONNECTOR_STATUSES = makeEnum([
  'AVAILABLE_FOR_CONFIGURATION',
  'COMING_SOON',
  'DISPLAY_ONLY',
  'PARTNER_MANAGED',
] as const);
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTOR_STATUS_LABELS: Record<ConnectorStatus, string> = {
  AVAILABLE_FOR_CONFIGURATION: 'Available for configuration',
  COMING_SOON: 'Coming soon',
  DISPLAY_ONLY: 'Display only',
  PARTNER_MANAGED: 'Partner managed',
};

export const AUTOMATION_LEVELS = makeEnum([
  'AUTOMATED',
  'PARTIAL',
  'MANUAL',
  'UNSUPPORTED',
] as const);
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export const AUTOMATION_LEVEL_LABELS: Record<AutomationLevel, string> = {
  AUTOMATED: 'Automated',
  PARTIAL: 'Partially automated',
  MANUAL: 'Manual action required',
  UNSUPPORTED: 'Not supported by public API',
};

export const PROVISIONING_STATUSES = makeEnum([
  'DRAFT',
  'IN_PROGRESS',
  'AWAITING_BIGCOMMERCE',
  'CONNECTED',
  'COMPLETED',
  'ABANDONED',
] as const);
export type ProvisioningStatus = (typeof PROVISIONING_STATUSES)[number];

export const STEP_STATUSES = makeEnum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'NOT_APPLICABLE',
] as const);
export type StepStatus = (typeof STEP_STATUSES)[number];

export const MANUAL_ACTION_STATUSES = makeEnum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'NOT_APPLICABLE',
] as const);
export type ManualActionStatus = (typeof MANUAL_ACTION_STATUSES)[number];

export const SNAPSHOT_SOURCES = makeEnum(['DEMO', 'API', 'IMPORT', 'DERIVED'] as const);
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number];

export const GRANULARITIES = makeEnum(['DAY', 'WEEK', 'MONTH'] as const);
export type Granularity = (typeof GRANULARITIES)[number];

export const TEMPLATE_STATUSES = makeEnum(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const);
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const SCOPE_LEVELS = makeEnum(['ORGANISATION', 'COMPANY', 'REGION'] as const);
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export const DISCOUNT_TYPES = makeEnum(['PERCENT', 'FIXED', 'PRICE_LIST', 'NONE'] as const);
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
