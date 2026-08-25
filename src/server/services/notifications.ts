import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { NotificationType, Severity } from '@/lib/enums';

export interface NotifyInput {
  organisationId: string;
  userId?: string | null;
  companyId?: string | null;
  connectionId?: string | null;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  correlationId?: string;
  /** Suppresses duplicates of the same type+resource within this many minutes. */
  dedupeWindowMinutes?: number;
}

/**
 * Raises an in-app notification. There is no email integration in v1 by design;
 * the notification centre is the delivery surface.
 */
export async function notify(input: NotifyInput): Promise<string | null> {
  try {
    if (input.dedupeWindowMinutes) {
      const since = new Date(Date.now() - input.dedupeWindowMinutes * 60_000);
      const existing = await prisma.notification.findFirst({
        where: {
          organisationId: input.organisationId,
          type: input.type,
          connectionId: input.connectionId ?? undefined,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    const notification = await prisma.notification.create({
      data: {
        organisationId: input.organisationId,
        userId: input.userId ?? null,
        companyId: input.companyId ?? null,
        connectionId: input.connectionId ?? null,
        type: input.type,
        severity: input.severity,
        title: input.title,
        body: input.body,
        actionLabel: input.actionLabel ?? null,
        actionHref: input.actionHref ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
    return notification.id;
  } catch (error) {
    logger.error('Failed to create notification', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function markNotificationRead(id: string, organisationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, organisationId },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllNotificationsRead(organisationId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { organisationId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

export async function unreadNotificationCount(organisationId: string): Promise<number> {
  return prisma.notification.count({ where: { organisationId, isRead: false } });
}
