import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityType, NotificationEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

const AUTHOR_SELECT = { id: true, fullName: true, email: true } as const;

const COMMENT_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  mentions: { include: { user: { select: AUTHOR_SELECT } } },
} satisfies Prisma.CommentInclude;

interface CreateCommentInput {
  body: string;
  isInternal?: boolean;
  mentionUserIds?: string[];
}

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
      include: COMMENT_INCLUDE,
    });
  }

  /**
   * Ai được nhắc tên trong yêu cầu này: người tạo, buyer phụ trách, những người
   * đã bình luận, và các tài khoản có quyền duyệt. Không trả về nhà cung cấp —
   * họ không truy cập được yêu cầu mua hàng.
   */
  async mentionableUsers(
    purchaseRequestId: string,
    user: AuthUser,
    search?: string,
  ) {
    const request = await this.requireAccess(purchaseRequestId, user);

    const commenters = await this.prisma.comment.findMany({
      where: { purchaseRequestId: request.id, deletedAt: null },
      select: { authorId: true },
      distinct: ['authorId'],
    });

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
      supplierId: null,
      OR: [
        { id: request.requesterId },
        ...(request.buyerId ? [{ id: request.buyerId }] : []),
        { id: { in: commenters.map((c) => c.authorId) } },
        {
          roles: {
            some: {
              role: {
                permissions: {
                  some: {
                    permission: { code: PERMISSIONS.PR_REVIEW },
                  },
                },
              },
            },
          },
        },
      ],
    };

    const users = await this.prisma.user.findMany({
      where: search
        ? {
            AND: [
              where,
              {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : where,
      select: {
        ...AUTHOR_SELECT,
        jobTitle: true,
        department: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
      take: 20,
    });

    // Không tự nhắc chính mình.
    return users.filter((u) => u.id !== user.id);
  }

  async create(
    purchaseRequestId: string,
    input: CreateCommentInput,
    user: AuthUser,
  ) {
    const request = await this.requireAccess(purchaseRequestId, user);
    const canBeInternal = user.permissions.includes(PERMISSIONS.PR_REVIEW);
    const isInternal = (input.isInternal ?? false) && canBeInternal;

    // Chỉ nhắc được người thực sự đọc được yêu cầu này; ghi chú nội bộ thì
    // người được nhắc còn phải có quyền duyệt, nếu không thông báo sẽ tiết lộ
    // nội dung mà họ không được xem.
    const allowed = await this.mentionableUsers(purchaseRequestId, user);
    const allowedById = new Map(allowed.map((u) => [u.id, u]));
    const mentioned = (input.mentionUserIds ?? []).filter((id) =>
      allowedById.has(id),
    );

    const comment = await this.prisma.comment.create({
      data: {
        body: input.body,
        authorId: user.id,
        entityType: EntityType.PURCHASE_REQUEST,
        purchaseRequestId: request.id,
        isInternal,
        mentions: { create: mentioned.map((userId) => ({ userId })) },
      },
      include: COMMENT_INCLUDE,
    });

    const excerpt = input.body.slice(0, 200);

    if (mentioned.length) {
      await this.notifications.notify({
        userIds: mentioned,
        event: NotificationEvent.COMMENT_ADDED,
        title: `${user.fullName} đã nhắc tên bạn trong ${request.code}`,
        body: excerpt,
        link: `/purchase-requests/${request.id}`,
        entityType: EntityType.PURCHASE_REQUEST,
        entityId: request.id,
      });
    }

    if (!isInternal) {
      // Người đã được nhắc thì không nhận thêm thông báo trùng.
      const recipients = [request.requesterId, request.buyerId].filter(
        (id): id is string =>
          typeof id === 'string' && id !== user.id && !mentioned.includes(id),
      );
      if (recipients.length) {
        await this.notifications.notify({
          userIds: recipients,
          event: NotificationEvent.COMMENT_ADDED,
          title: `Bình luận mới trên ${request.code}`,
          body: `${user.fullName}: ${excerpt}`,
          link: `/purchase-requests/${request.id}`,
          entityType: EntityType.PURCHASE_REQUEST,
          entityId: request.id,
        });
      }
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
