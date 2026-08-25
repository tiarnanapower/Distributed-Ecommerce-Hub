import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section } from '@/components/shared/page-header';
import { InfoNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES, type NotificationType } from '@/lib/enums';
import { formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notification preferences' };
export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/notifications');
  const scope = scopeFromAuth(auth);

  const [byType, recent] = await Promise.all([
    prisma.notification.groupBy({
      by: ['type', 'severity'],
      where: { organisationId: scope.organisationId },
      _count: { _all: true },
    }),
    prisma.notification.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { connection: { select: { name: true } } },
    }),
  ]);

  const countFor = (type: string) =>
    byType.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry._count._all, 0);

  return (
    <div className="space-y-4">
      <InfoNote>
        <span className="font-medium">There is no email integration in this release.</span> The in-app
        notification centre is the delivery surface. Every event type below is raised by the platform itself,
        deduplicated within a time window so a recurring failure does not flood the list.
      </InfoNote>

      <Section title="Event types" description="What the platform notifies you about, and how often it has.">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Raised when</TableHead>
                <TableHead className="text-right">Occurrences</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {NOTIFICATION_TYPES.map((type) => (
                <TableRow key={type}>
                  <TableCell className="font-medium">
                    {NOTIFICATION_TYPE_LABELS[type as NotificationType]}
                  </TableCell>
                  <TableCell className="max-w-lg">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {TYPE_TRIGGERS[type as NotificationType]}
                    </p>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatNumber(countFor(type))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Recent notifications">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Raised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((notification) => (
                <TableRow key={notification.id}>
                  <TableCell className="max-w-md">
                    <p className="font-medium">{notification.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{notification.body}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {NOTIFICATION_TYPE_LABELS[notification.type as NotificationType] ?? notification.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        notification.severity === 'CRITICAL'
                          ? 'destructive'
                          : notification.severity === 'WARNING'
                            ? 'warning'
                            : notification.severity === 'SUCCESS'
                              ? 'success'
                              : 'info'
                      }
                      size="sm"
                    >
                      {titleCase(notification.severity)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {notification.connection?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={notification.isRead ? 'muted' : 'default'} size="sm">
                      {notification.isRead ? 'Read' : 'Unread'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>
    </div>
  );
}

const TYPE_TRIGGERS: Record<NotificationType, string> = {
  CONNECTION_FAILURE: 'A connection test fails for any reason other than an invalid token.',
  TOKEN_INVALID: 'BigCommerce returns 401 for a store, meaning the stored token has been revoked or rotated.',
  MISSING_PERMISSION: 'A capability probe finds the API account is missing a scope the platform can use.',
  SYNC_FAILURE: 'A job finishes in the FAILED state.',
  DEPLOYMENT_COMPLETED: 'A deployment applies every planned change without failure.',
  DEPLOYMENT_PARTIAL: 'A deployment finishes with some items blocked, skipped or failed.',
  APPROVAL_REQUESTED: 'A deployment enters the AWAITING_APPROVAL state.',
  APPROVAL_GRANTED: 'A pending approval is decided.',
  STORE_DRIFT_DETECTED: 'A comparison scan opens new conflicts for a store.',
  LOW_INVENTORY: 'Products fall to or below their low-stock threshold.',
  THEME_MISMATCH: 'A store runs a theme version behind the published managed release.',
  STORE_UNAVAILABLE: 'A store cannot be reached at all.',
  MANUAL_ACTION_REQUIRED: 'A change is identified that has no supported public API.',
};
