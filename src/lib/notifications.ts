import "server-only";
import { prisma } from "@/lib/db";
import type { NotificationType, Severity } from "@/generated/prisma/client";

export async function notify(opts: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  severity?: Severity;
  refType?: string;
  refId?: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      severity: opts.severity ?? "INFO",
      refType: opts.refType,
      refId: opts.refId,
    },
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
