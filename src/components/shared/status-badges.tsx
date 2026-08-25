import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Eye,
  HelpCircle,
  Lock,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CAPABILITY_STATUS_LABELS,
  CONFLICT_TYPE_LABELS,
  DEPLOYMENT_STATUS_LABELS,
  JOB_STATUS_LABELS,
  type CapabilityStatus,
  type ConflictType,
  type ConnectionStatus,
  type ContentStatus,
  type DeploymentStatus,
  type HealthStatus,
  type JobStatus,
  type RiskLevel,
} from '@/lib/enums';
import { titleCase } from '@/lib/utils';

type Variant = NonNullable<BadgeProps['variant']>;

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

const CAPABILITY_VARIANT: Record<CapabilityStatus, Variant> = {
  AVAILABLE: 'success',
  READ_ONLY: 'info',
  PERMISSION_MISSING: 'destructive',
  PLAN_DEPENDENT: 'warning',
  MANUAL_ACTION: 'warning',
  NOT_SUPPORTED: 'muted',
  NOT_IMPLEMENTED: 'muted',
};

const CAPABILITY_ICON: Record<CapabilityStatus, typeof CheckCircle2> = {
  AVAILABLE: CheckCircle2,
  READ_ONLY: Eye,
  PERMISSION_MISSING: Lock,
  PLAN_DEPENDENT: ShieldAlert,
  MANUAL_ACTION: Wrench,
  NOT_SUPPORTED: Ban,
  NOT_IMPLEMENTED: CircleDashed,
};

export function CapabilityBadge({
  status,
  className,
  showIcon = true,
}: {
  status: CapabilityStatus | string;
  className?: string;
  showIcon?: boolean;
}) {
  const key = (status as CapabilityStatus) in CAPABILITY_VARIANT ? (status as CapabilityStatus) : 'NOT_SUPPORTED';
  const Icon = CAPABILITY_ICON[key];
  return (
    <Badge variant={CAPABILITY_VARIANT[key]} className={className}>
      {showIcon ? <Icon aria-hidden /> : null}
      {CAPABILITY_STATUS_LABELS[key]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Store health
// ---------------------------------------------------------------------------

const HEALTH_VARIANT: Record<HealthStatus, Variant> = {
  HEALTHY: 'success',
  WARNING: 'warning',
  CRITICAL: 'destructive',
  UNKNOWN: 'muted',
};

const HEALTH_LABEL: Record<HealthStatus, string> = {
  HEALTHY: 'Healthy',
  WARNING: 'Needs attention',
  CRITICAL: 'Critical',
  UNKNOWN: 'Unknown',
};

export function HealthBadge({ status, className }: { status: HealthStatus | string; className?: string }) {
  const key = (status as HealthStatus) in HEALTH_VARIANT ? (status as HealthStatus) : 'UNKNOWN';
  const Icon = key === 'HEALTHY' ? CheckCircle2 : key === 'CRITICAL' ? XCircle : key === 'WARNING' ? AlertTriangle : HelpCircle;
  return (
    <Badge variant={HEALTH_VARIANT[key]} className={className}>
      <Icon aria-hidden />
      {HEALTH_LABEL[key]}
    </Badge>
  );
}

/** A compact dot for dense tables where a full badge is too heavy. */
export function HealthDot({ status, className }: { status: HealthStatus | string; className?: string }) {
  const colour =
    status === 'HEALTHY'
      ? 'bg-success'
      : status === 'WARNING'
        ? 'bg-warning'
        : status === 'CRITICAL'
          ? 'bg-destructive'
          : 'bg-muted-foreground/40';
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', colour, className)}
      role="img"
      aria-label={HEALTH_LABEL[(status as HealthStatus) in HEALTH_LABEL ? (status as HealthStatus) : 'UNKNOWN']}
    />
  );
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

const CONNECTION_VARIANT: Record<ConnectionStatus, Variant> = {
  PLANNED: 'muted',
  CONNECTING: 'info',
  ACTIVE: 'success',
  DEGRADED: 'warning',
  DISCONNECTED: 'destructive',
  ARCHIVED: 'muted',
};

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus | string }) {
  const key = (status as ConnectionStatus) in CONNECTION_VARIANT ? (status as ConnectionStatus) : 'PLANNED';
  return <Badge variant={CONNECTION_VARIANT[key]}>{titleCase(key)}</Badge>;
}

// ---------------------------------------------------------------------------
// Jobs and deployments
// ---------------------------------------------------------------------------

const JOB_VARIANT: Record<JobStatus, Variant> = {
  DRAFT: 'muted',
  QUEUED: 'secondary',
  RUNNING: 'info',
  COMPLETED: 'success',
  PARTIAL: 'warning',
  FAILED: 'destructive',
  CANCELLED: 'muted',
  AWAITING_APPROVAL: 'warning',
};

export function JobStatusBadge({ status }: { status: JobStatus | string }) {
  const key = (status as JobStatus) in JOB_VARIANT ? (status as JobStatus) : 'DRAFT';
  return (
    <Badge variant={JOB_VARIANT[key]}>
      {key === 'RUNNING' ? <Clock className="animate-pulse" aria-hidden /> : null}
      {JOB_STATUS_LABELS[key]}
    </Badge>
  );
}

const DEPLOYMENT_VARIANT: Record<DeploymentStatus, Variant> = {
  DRAFT: 'muted',
  AWAITING_APPROVAL: 'warning',
  APPROVED: 'info',
  REJECTED: 'destructive',
  QUEUED: 'secondary',
  RUNNING: 'info',
  COMPLETED: 'success',
  PARTIAL: 'warning',
  FAILED: 'destructive',
  CANCELLED: 'muted',
  ROLLED_BACK: 'muted',
};

export function DeploymentStatusBadge({ status }: { status: DeploymentStatus | string }) {
  const key = (status as DeploymentStatus) in DEPLOYMENT_VARIANT ? (status as DeploymentStatus) : 'DRAFT';
  return <Badge variant={DEPLOYMENT_VARIANT[key]}>{DEPLOYMENT_STATUS_LABELS[key]}</Badge>;
}

// ---------------------------------------------------------------------------
// Risk and conflicts
// ---------------------------------------------------------------------------

const RISK_VARIANT: Record<RiskLevel, Variant> = {
  LOW: 'muted',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'destructive',
};

export function RiskBadge({ level }: { level: RiskLevel | string }) {
  const key = (level as RiskLevel) in RISK_VARIANT ? (level as RiskLevel) : 'LOW';
  return (
    <Badge variant={RISK_VARIANT[key]}>
      {key === 'CRITICAL' || key === 'HIGH' ? <AlertTriangle aria-hidden /> : null}
      {titleCase(key)} risk
    </Badge>
  );
}

export function ConflictTypeBadge({ type }: { type: ConflictType | string }) {
  const key = (type as ConflictType) in CONFLICT_TYPE_LABELS ? (type as ConflictType) : 'VALUE_MISMATCH';
  const variant: Variant =
    key === 'MISSING_IN_TARGET'
      ? 'warning'
      : key === 'EXTRA_IN_TARGET'
        ? 'info'
        : key === 'LOCAL_OVERRIDE'
          ? 'secondary'
          : key === 'SOURCE_CHANGED_AFTER_OVERRIDE'
            ? 'warning'
            : key === 'PERMISSION_MISSING' || key === 'DEPLOYMENT_FAILURE'
              ? 'destructive'
              : key === 'UNSUPPORTED_TARGET_CAPABILITY'
                ? 'muted'
                : 'default';
  return <Badge variant={variant}>{CONFLICT_TYPE_LABELS[key]}</Badge>;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const CONTENT_VARIANT: Record<ContentStatus, Variant> = {
  DRAFT: 'muted',
  REVIEW: 'info',
  APPROVED: 'info',
  SCHEDULED: 'warning',
  PUBLISHED: 'success',
  FAILED: 'destructive',
  ARCHIVED: 'muted',
};

export function ContentStatusBadge({ status }: { status: ContentStatus | string }) {
  const key = (status as ContentStatus) in CONTENT_VARIANT ? (status as ContentStatus) : 'DRAFT';
  return <Badge variant={CONTENT_VARIANT[key]}>{titleCase(key)}</Badge>;
}

// ---------------------------------------------------------------------------
// Data source — the single most important label in the product
// ---------------------------------------------------------------------------

/**
 * Marks whether the surrounding numbers came from seeded demo data or a live
 * BigCommerce read. Demo and connected data are never blended without this.
 */
export function DataSourceBadge({
  source,
  reason,
  className,
}: {
  source: 'DEMO' | 'LIVE' | 'MIXED';
  reason?: string;
  className?: string;
}) {
  if (source === 'LIVE') {
    return (
      <Badge variant="success" className={className} title={reason}>
        <CheckCircle2 aria-hidden />
        Live data
      </Badge>
    );
  }
  if (source === 'MIXED') {
    return (
      <Badge variant="warning" className={className} title={reason}>
        <AlertTriangle aria-hidden />
        Mixed sources
      </Badge>
    );
  }
  return (
    <Badge variant="info" className={className} title={reason}>
      <CircleDashed aria-hidden />
      Demo mode
    </Badge>
  );
}

/** Marks a value that exists but could not be retrieved or derived. */
export function UnavailableValue({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" title={reason}>
      <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      Unavailable
    </span>
  );
}
