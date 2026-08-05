import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityType, NotificationEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(purchaseRequestId: string, user: AuthUser) {
    const request = await this.requireAccess(purchaseRequestId, user);
    const isReviewer = user.permissions.includes(PERMISSIONS.PR_REVIEW);

    return this.prisma.comment.findMany({
      where: {
        purchaseRequestId: request.id,
        deletedAt: null,
        // Internal buyer notes stay hidden from the requester.
        ...(isReviewer ? {} : { isInternal: false }),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async create(
    purchaseRequestId: string,
    body: string,
    isInternal: boolean,
    user: AuthUser,
  ) {
    const request = await this.requireAccess(purchaseRequestId, user);
    const canBeInternal = user.permissions.includes(PERMISSIONS.PR_REVIEW);

    const comment = await this.prisma.comment.create({
      data: {
        body,
        authorId: user.id,
        entityType: EntityType.PURCHASE_REQUEST,
        purchaseRequestId: request.id,
        isInternal: isInternal && canBeInternal,
      },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!comment.isInternal) {
      const recipients = [request.requesterId, request.buyerId].filter(
        (id): id is string => Boolean(id) && id !== user.id,
      );
      await this.notifications.notify({
        userIds: recipients,
        event: NotificationEvent.COMMENT_ADDED,
        title: `Bình luận mới trên ${request.code}`,
        body: `${user.fullName}: ${body.slice(0, 200)}`,
        link: `/purchase-requests/${request.id}`,
        entityType: EntityType.PURCHASE_REQUEST,
        entityId: request.id,
      });
    }

    return comment;
  }

  private async requireAccess(purchaseRequestId: string, user: AuthUser) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id: purchaseRequestId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Purchase request not found');

    const canReadAll = user.permissions.includes(PERMISSIONS.PR_READ_ALL);
    if (!canReadAll && request.requesterId !== user.id) {
      throw new ForbiddenException('You cannot access this purchase request');
    }
    return request;
  }
}
