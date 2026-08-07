import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationEvent,
  EntityType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

export interface NotifyInput {
  userIds: string[];
  event: NotificationEvent;
  title: string;
  body: string;
  link?: string;
  entityType?: EntityType;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes the in-app record and queues the email copy. Email delivery is
   * logged in development; wiring an SMTP transport only changes `sendEmail`.
   */
  async notify(input: NotifyInput): Promise<void> {
    const userIds = [...new Set(input.userIds)].filter(Boolean);
    if (!userIds.length) return;

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        event: input.event,
        channel: NotificationChannel.IN_APP,
        title: input.title,
        body: input.body,
        link: input.link,
        entityType: input.entityType,
        entityId: input.entityId,
      })),
    });

    await this.sendEmail(userIds, input);
  }

  async findForUser(userId: string, dto: PaginationDto, unreadOnly = false) {
    const where = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [data, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { ...paginate(data, total, dto), unread };
  }

  async markRead(id: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { success: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, count: result.count };
  }

  private async sendEmail(userIds: string[], input: NotifyInput) {
    const recipients = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true, email: true },
    });

    // Without SMTP configured the email copy is logged rather than sent.
    for (const recipient of recipients) {
      this.logger.log(
        `[email:${input.event}] to=${recipient.email} subject="${input.title}"`,
      );
    }

    // Một RFQ có thể gửi cho hàng chục nhà cung cấp; ghi từng bản một là từng
    // ấy lượt đi lại với database.
    const sentAt = new Date();
    await this.prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        event: input.event,
        channel: NotificationChannel.EMAIL,
        title: input.title,
        body: input.body,
        link: input.link,
        entityType: input.entityType,
        entityId: input.entityId,
        sentAt,
      })),
    });
  }
}
