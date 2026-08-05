import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalDecision,
  FieldType,
  NotificationEvent,
  EntityType,
  Prisma,
  PurchaseRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { ApprovalRoutingService } from '../approvals/approval-routing.service';
import { AuthUser } from '../../common/decorators';
import { PERMISSIONS, ROLES } from '../../common/permissions';
import { paginate } from '../../common/dto/pagination.dto';
import {
  CreatePurchaseRequestDto,
  PurchaseRequestItemDto,
  QueryPurchaseRequestDto,
  ReviewDecisionDto,
  UpdatePurchaseRequestDto,
} from './dto/purchase-request.dto';

/** Statuses in which the requester may still edit their own request. */
const EDITABLE_STATUSES: PurchaseRequestStatus[] = [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.NEED_CLARIFICATION,
];

const DETAIL_INCLUDE = {
  requester: { select: { id: true, fullName: true, email: true } },
  buyer: { select: { id: true, fullName: true, email: true } },
  department: true,
  project: true,
  category: true,
  items: { orderBy: { lineNo: 'asc' } },
  dynamicValues: { include: { field: true } },
  approvalHistories: {
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, fullName: true, email: true } } },
  },
  attachments: { where: { deletedAt: null } },
  currentStep: { include: { role: true } },
  approvalWorkflow: { include: { steps: { orderBy: { stepOrder: 'asc' }, include: { role: true } } } },
  _count: { select: { comments: true, rfqs: true } },
} satisfies Prisma.PurchaseRequestInclude;

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly codes: CodeGeneratorService,
    private readonly routing: ApprovalRoutingService,
  ) {}

  async findAll(dto: QueryPurchaseRequestDto, user: AuthUser) {
    const where: Prisma.PurchaseRequestWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
      ...(dto.search
        ? {
            OR: [
              { code: { contains: dto.search, mode: 'insensitive' } },
              { title: { contains: dto.search, mode: 'insensitive' } },
              { description: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Users without read_all only ever see their own requests.
    const canReadAll = user.permissions.includes(PERMISSIONS.PR_READ_ALL);
    if (!canReadAll || dto.mine) {
      where.requesterId = user.id;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { [dto.sortBy]: dto.sortOrder },
        include: {
          requester: { select: { id: true, fullName: true, email: true } },
          buyer: { select: { id: true, fullName: true } },
          category: {
            select: { id: true, name: true, nameEn: true, code: true },
          },
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true, rfqs: true } },
        },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  /** Requests waiting at a step the caller holds the role for. */
  async pendingForMe(user: AuthUser, dto: QueryPurchaseRequestDto) {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true },
    });
    const roleIds = roles.map((r) => r.roleId);

    const where: Prisma.PurchaseRequestWhereInput = {
      deletedAt: null,
      status: {
        in: [
          PurchaseRequestStatus.SUBMITTED,
          PurchaseRequestStatus.BUYER_REVIEW,
        ],
      },
      OR: [
        { currentStep: { roleId: { in: roleIds } } },
        { currentStep: { roleId: null } },
        // Requests that matched no workflow still land with the buyers.
        { currentStepId: null },
      ],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { submittedAt: 'asc' },
        include: {
          requester: { select: { id: true, fullName: true, email: true } },
          category: { select: { id: true, name: true, nameEn: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          currentStep: { include: { role: true } },
          approvalWorkflow: { select: { id: true, name: true } },
        },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string, user: AuthUser) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!request) throw new NotFoundException('Purchase request not found');

    const canReadAll = user.permissions.includes(PERMISSIONS.PR_READ_ALL);
    if (!canReadAll && request.requesterId !== user.id) {
      throw new ForbiddenException('You cannot access this purchase request');
    }

    return request;
  }

  async create(dto: CreatePurchaseRequestDto, user: AuthUser) {
    const departmentId = dto.departmentId ?? user.departmentId;
    if (!departmentId) {
      throw new BadRequestException(
        'A department is required; set one on your profile or pass departmentId',
      );
    }

    await this.assertCategoryExists(dto.categoryId);
    const dynamicData = await this.buildDynamicValues(
      dto.categoryId,
      dto.dynamicValues,
      false,
    );
    const items = this.normaliseItems(dto.items ?? []);
    const code = await this.codes.next('PR');

    const request = await this.prisma.purchaseRequest.create({
      data: {
        code,
        title: dto.title,
        description: dto.description,
        reason: dto.reason,
        categoryId: dto.categoryId,
        departmentId,
        projectId: dto.projectId,
        priority: dto.priority,
        neededByDate: dto.neededByDate ? new Date(dto.neededByDate) : null,
        budgetAmount: dto.budgetAmount,
        currency: dto.currency ?? 'VND',
        estimatedTotal: this.estimateTotal(items),
        requesterId: user.id,
        status: PurchaseRequestStatus.DRAFT,
        items: { create: items },
        dynamicValues: { create: dynamicData },
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'CREATE',
      module: 'purchase_request',
      entityId: request.id,
      newValue: { code: request.code, title: request.title },
    });

    return request;
  }

  async update(id: string, dto: UpdatePurchaseRequestDto, user: AuthUser) {
    const current = await this.findOne(id, user);

    if (current.requesterId !== user.id) {
      throw new ForbiddenException('Only the requester can edit this request');
    }
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new BadRequestException(
        `A request in status ${current.status} can no longer be edited`,
      );
    }

    const categoryId = dto.categoryId ?? current.categoryId;
    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const items = dto.items ? this.normaliseItems(dto.items) : null;
    const dynamicData =
      dto.dynamicValues || dto.categoryId
        ? await this.buildDynamicValues(categoryId, dto.dynamicValues, false)
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseRequestItem.deleteMany({
          where: { purchaseRequestId: id },
        });
      }
      if (dynamicData) {
        await tx.dynamicFieldValue.deleteMany({
          where: { purchaseRequestId: id },
        });
      }

      return tx.purchaseRequest.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          reason: dto.reason,
          categoryId: dto.categoryId,
          departmentId: dto.departmentId,
          projectId: dto.projectId,
          priority: dto.priority,
          neededByDate: dto.neededByDate
            ? new Date(dto.neededByDate)
            : undefined,
          budgetAmount: dto.budgetAmount,
          currency: dto.currency,
          ...(items
            ? {
                items: { create: items },
                estimatedTotal: this.estimateTotal(items),
              }
            : {}),
          ...(dynamicData ? { dynamicValues: { create: dynamicData } } : {}),
        },
        include: DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      module: 'purchase_request',
      entityId: id,
      oldValue: { title: current.title, status: current.status },
      newValue: { title: updated.title },
    });

    return updated;
  }

  async submit(id: string, user: AuthUser) {
    const current = await this.findOne(id, user);

    if (current.requesterId !== user.id) {
      throw new ForbiddenException(
        'Only the requester can submit this request',
      );
    }
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new BadRequestException(
        `A request in status ${current.status} cannot be submitted`,
      );
    }
    if (current.items.length === 0) {
      throw new BadRequestException(
        'Add at least one line item before submitting',
      );
    }

    // Required dynamic fields are only enforced at submit time so drafts can
    // be saved incrementally.
    await this.buildDynamicValues(
      current.categoryId,
      Object.fromEntries(
        current.dynamicValues.map((v) => [v.field.key, v.value]),
      ),
      true,
    );

    // The chain is fixed at submit time so later config changes do not shift
    // a request that is already travelling through approval.
    const workflow = await this.routing.resolve({
      amount: current.estimatedTotal ?? current.budgetAmount,
      categoryId: current.categoryId,
      departmentId: current.departmentId,
    });
    const firstStep = workflow?.steps[0] ?? null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await tx.purchaseRequest.update({
        where: { id },
        data: {
          status: PurchaseRequestStatus.SUBMITTED,
          submittedAt: new Date(),
          clarificationNote: null,
          approvalWorkflowId: workflow?.workflowId ?? null,
          currentStepId: firstStep?.id ?? null,
          slaDueAt: firstStep?.slaHours
            ? new Date(Date.now() + firstStep.slaHours * 3_600_000)
            : null,
        },
        include: DETAIL_INCLUDE,
      });

      await tx.approvalHistory.create({
        data: {
          purchaseRequestId: id,
          actorId: user.id,
          stepId: firstStep?.id ?? null,
          decision: ApprovalDecision.PENDING,
          fromStatus: current.status,
          toStatus: PurchaseRequestStatus.SUBMITTED,
          comment: workflow
            ? `Đã gửi duyệt theo quy trình "${workflow.name}" (${workflow.steps.length} cấp)`
            : 'Đã gửi để bộ phận mua hàng xem xét',
        },
      });

      return request;
    });

    // Notify whoever owns the first step; fall back to buyers when the request
    // did not match any configured workflow.
    const stepApprovers = firstStep
      ? await this.routing.approverIds(firstStep.id)
      : [];
    await this.notifications.notify({
      userIds: stepApprovers.length ? stepApprovers : await this.buyerIds(),
      event: NotificationEvent.PR_SUBMITTED,
      title: `Yêu cầu mua hàng mới: ${updated.code}`,
      body: `${updated.requester.fullName} đã gửi yêu cầu "${updated.title}"${
        firstStep ? ` — chờ duyệt ở cấp "${firstStep.name}"` : ''
      }.`,
      link: `/purchase-requests/${updated.id}`,
      entityType: EntityType.PURCHASE_REQUEST,
      entityId: updated.id,
    });

    await this.audit.record({
      userId: user.id,
      action: 'SUBMIT',
      module: 'purchase_request',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  async startReview(id: string, user: AuthUser) {
    const current = await this.requireReviewable(id, [
      PurchaseRequestStatus.SUBMITTED,
    ]);
    await this.assertCanActOnCurrentStep(current, user);

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.BUYER_REVIEW,
        buyerId: user.id,
        reviewedAt: new Date(),
      },
      include: DETAIL_INCLUDE,
    });

    await this.recordDecision(
      id,
      user.id,
      ApprovalDecision.PENDING,
      current.status,
      updated.status,
      'Buyer started the review',
    );

    return this.detail(id);
  }

  async approve(id: string, dto: ReviewDecisionDto, user: AuthUser) {
    const current = await this.requireReviewable(id, [
      PurchaseRequestStatus.SUBMITTED,
      PurchaseRequestStatus.BUYER_REVIEW,
    ]);

    await this.assertCanActOnCurrentStep(current, user);

    // Approving advances one level; the request is only APPROVED once the last
    // level in the chain has signed off.
    const step = current.currentStepId
      ? await this.prisma.approvalStep.findUnique({
          where: { id: current.currentStepId },
        })
      : null;
    const nextStep =
      current.approvalWorkflowId && step
        ? await this.routing.nextStep(current.approvalWorkflowId, step.stepOrder)
        : null;

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: nextStep
        ? {
            status: PurchaseRequestStatus.SUBMITTED,
            currentStepId: nextStep.id,
            buyerId: current.buyerId ?? user.id,
            rejectReason: null,
            clarificationNote: null,
            slaDueAt: nextStep.slaHours
              ? new Date(Date.now() + nextStep.slaHours * 3_600_000)
              : null,
          }
        : {
            status: PurchaseRequestStatus.APPROVED,
            approvedAt: new Date(),
            currentStepId: null,
            slaDueAt: null,
            buyerId: current.buyerId ?? user.id,
            rejectReason: null,
            clarificationNote: null,
          },
      include: DETAIL_INCLUDE,
    });

    await this.prisma.approvalHistory.create({
      data: {
        purchaseRequestId: id,
        actorId: user.id,
        stepId: step?.id ?? null,
        decision: ApprovalDecision.APPROVED,
        fromStatus: current.status,
        toStatus: updated.status,
        comment: step
          ? `Duyệt cấp "${step.name}"${dto.comment ? `: ${dto.comment}` : ''}`
          : dto.comment,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'APPROVED',
      module: 'purchase_request',
      entityId: id,
      oldValue: { status: current.status, step: step?.name },
      newValue: { status: updated.status, nextStep: nextStep?.name ?? null },
    });

    if (nextStep) {
      await this.notifications.notify({
        userIds: await this.routing.approverIds(nextStep.id),
        event: NotificationEvent.APPROVAL_REQUESTED,
        title: `Yêu cầu ${updated.code} chờ bạn duyệt`,
        body: `Đã qua cấp "${step?.name}", nay chờ duyệt ở cấp "${nextStep.name}".`,
        link: `/purchase-requests/${updated.id}`,
        entityType: EntityType.PURCHASE_REQUEST,
        entityId: updated.id,
      });
      await this.notifications.notify({
        userIds: [updated.requesterId],
        event: NotificationEvent.APPROVAL_REQUESTED,
        title: `Yêu cầu ${updated.code} đã qua cấp "${step?.name}"`,
        body: `Đang chờ duyệt ở cấp tiếp theo: "${nextStep.name}".`,
        link: `/purchase-requests/${updated.id}`,
        entityType: EntityType.PURCHASE_REQUEST,
        entityId: updated.id,
      });
    } else {
      await this.notifications.notify({
        userIds: [updated.requesterId],
        event: NotificationEvent.PR_APPROVED,
        title: `Yêu cầu ${updated.code} đã được duyệt`,
        body:
          dto.comment ?? 'Yêu cầu của bạn đã được duyệt và sẵn sàng tạo RFQ.',
        link: `/purchase-requests/${updated.id}`,
        entityType: EntityType.PURCHASE_REQUEST,
        entityId: updated.id,
      });
    }

    return this.detail(id);
  }

  /**
   * Guards a decision against the chain: only a holder of the current step's
   * role may act, so a buyer cannot sign off a level reserved for Finance.
   */
  private async assertCanActOnCurrentStep(
    current: { currentStepId: string | null },
    user: AuthUser,
  ) {
    if (!current.currentStepId) return;
    const allowed = await this.routing.canActOnStep(
      current.currentStepId,
      user.id,
    );
    if (!allowed) {
      const step = await this.prisma.approvalStep.findUnique({
        where: { id: current.currentStepId },
        include: { role: true },
      });
      throw new ForbiddenException(
        `Yêu cầu đang chờ duyệt ở cấp "${step?.name}"${
          step?.role ? ` (vai trò ${step.role.name})` : ''
        }, bạn không có quyền duyệt cấp này`,
      );
    }
  }

  async reject(id: string, dto: ReviewDecisionDto, user: AuthUser) {
    if (!dto.comment?.trim()) {
      throw new BadRequestException('A reason is required when rejecting');
    }

    const current = await this.requireReviewable(id, [
      PurchaseRequestStatus.SUBMITTED,
      PurchaseRequestStatus.BUYER_REVIEW,
    ]);
    await this.assertCanActOnCurrentStep(current, user);

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.REJECTED,
        currentStepId: null,
        slaDueAt: null,
        rejectedAt: new Date(),
        rejectReason: dto.comment,
        buyerId: current.buyerId ?? user.id,
      },
      include: DETAIL_INCLUDE,
    });

    await this.recordDecision(
      id,
      user.id,
      ApprovalDecision.REJECTED,
      current.status,
      updated.status,
      dto.comment,
    );

    await this.notifications.notify({
      userIds: [updated.requesterId],
      event: NotificationEvent.PR_REJECTED,
      title: `Yêu cầu ${updated.code} bị từ chối`,
      body: dto.comment,
      link: `/purchase-requests/${updated.id}`,
      entityType: EntityType.PURCHASE_REQUEST,
      entityId: updated.id,
    });

    return this.detail(id);
  }

  async requestClarification(
    id: string,
    dto: ReviewDecisionDto,
    user: AuthUser,
  ) {
    if (!dto.comment?.trim()) {
      throw new BadRequestException(
        'Describe what the requester needs to clarify',
      );
    }

    const current = await this.requireReviewable(id, [
      PurchaseRequestStatus.SUBMITTED,
      PurchaseRequestStatus.BUYER_REVIEW,
    ]);
    await this.assertCanActOnCurrentStep(current, user);

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.NEED_CLARIFICATION,
        clarificationNote: dto.comment,
        buyerId: current.buyerId ?? user.id,
      },
      include: DETAIL_INCLUDE,
    });

    await this.recordDecision(
      id,
      user.id,
      ApprovalDecision.CLARIFICATION_REQUESTED,
      current.status,
      updated.status,
      dto.comment,
    );

    await this.notifications.notify({
      userIds: [updated.requesterId],
      event: NotificationEvent.PR_NEED_CLARIFICATION,
      title: `Yêu cầu ${updated.code} cần bổ sung thông tin`,
      body: dto.comment,
      link: `/purchase-requests/${updated.id}`,
      entityType: EntityType.PURCHASE_REQUEST,
      entityId: updated.id,
    });

    return this.detail(id);
  }

  async remove(id: string, user: AuthUser) {
    const current = await this.findOne(id, user);
    if (current.requesterId !== user.id) {
      throw new ForbiddenException(
        'Only the requester can delete this request',
      );
    }
    if (current.status !== PurchaseRequestStatus.DRAFT) {
      throw new BadRequestException('Only drafts can be deleted');
    }

    await this.prisma.purchaseRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      userId: user.id,
      action: 'DELETE',
      module: 'purchase_request',
      entityId: id,
      oldValue: { code: current.code, status: current.status },
    });
    return { success: true };
  }

  /** Re-reads the request so the response includes the decision just recorded. */
  private detail(id: string) {
    return this.prisma.purchaseRequest.findFirstOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }

  private async requireReviewable(
    id: string,
    allowed: PurchaseRequestStatus[],
  ) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Purchase request not found');
    if (!allowed.includes(request.status)) {
      throw new BadRequestException(
        `A request in status ${request.status} cannot be reviewed`,
      );
    }
    return request;
  }

  private async recordDecision(
    purchaseRequestId: string,
    actorId: string,
    decision: ApprovalDecision,
    fromStatus: string,
    toStatus: string,
    comment?: string,
  ) {
    await this.prisma.approvalHistory.create({
      data: {
        purchaseRequestId,
        actorId,
        decision,
        fromStatus,
        toStatus,
        comment,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: decision,
      module: 'purchase_request',
      entityId: purchaseRequestId,
      oldValue: { status: fromStatus },
      newValue: { status: toStatus, comment },
    });
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null, isActive: true },
    });
    if (!category)
      throw new BadRequestException('Category not found or inactive');
  }

  /**
   * Maps submitted values onto the category's active form. Unknown keys are
   * rejected so the stored payload always matches a real field definition.
   */
  private async buildDynamicValues(
    categoryId: string,
    values: Record<string, unknown> | undefined,
    enforceRequired: boolean,
  ): Promise<{ fieldId: string; value: string | null }[]> {
    const form = await this.prisma.dynamicForm.findFirst({
      where: { categoryId, isActive: true, deletedAt: null },
      orderBy: { version: 'desc' },
      include: { fields: true },
    });

    if (!form) return [];

    const provided = values ?? {};
    const byKey = new Map(form.fields.map((f) => [f.key, f]));

    const unknown = Object.keys(provided).filter((key) => !byKey.has(key));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown field(s) for this category: ${unknown.join(', ')}`,
      );
    }

    const result: { fieldId: string; value: string | null }[] = [];

    for (const field of form.fields) {
      const raw = provided[field.key];
      const isEmpty = raw === undefined || raw === null || raw === '';

      if (isEmpty) {
        if (enforceRequired && field.isRequired) {
          throw new BadRequestException(`"${field.label}" is required`);
        }
        result.push({ fieldId: field.id, value: null });
        continue;
      }

      result.push({
        fieldId: field.id,
        value: this.serialiseFieldValue(field.type, field.label, raw),
      });
    }

    return result;
  }

  private serialiseFieldValue(
    type: FieldType,
    label: string,
    raw: unknown,
  ): string {
    switch (type) {
      case FieldType.NUMBER:
      case FieldType.DECIMAL: {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          throw new BadRequestException(`"${label}" must be a number`);
        }
        return String(num);
      }
      case FieldType.DATE:
      case FieldType.DATETIME: {
        const date = new Date(String(raw));
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException(`"${label}" must be a valid date`);
        }
        return date.toISOString();
      }
      case FieldType.CHECKBOX:
        return String(raw === true || raw === 'true');
      case FieldType.MULTISELECT:
        return JSON.stringify(Array.isArray(raw) ? raw : [raw]);
      default:
        return String(raw);
    }
  }

  private normaliseItems(items: PurchaseRequestItemDto[]) {
    return items.map((item, index) => ({
      lineNo: item.lineNo ?? index + 1,
      name: item.name,
      description: item.description,
      specification: item.specification,
      quantity: new Prisma.Decimal(item.quantity),
      unit: item.unit,
      estimatedPrice:
        item.estimatedPrice === undefined
          ? null
          : new Prisma.Decimal(item.estimatedPrice),
    }));
  }

  private estimateTotal(
    items: {
      quantity: Prisma.Decimal;
      estimatedPrice: Prisma.Decimal | null;
    }[],
  ) {
    return items.reduce(
      (total, item) =>
        item.estimatedPrice
          ? total.add(item.estimatedPrice.mul(item.quantity))
          : total,
      new Prisma.Decimal(0),
    );
  }

  private async buyerIds(): Promise<string[]> {
    const buyers = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: {
          some: {
            role: {
              code: { in: [ROLES.BUYER, ROLES.PROCUREMENT_MANAGER] },
            },
          },
        },
      },
      select: { id: true },
    });
    return buyers.map((b) => b.id);
  }
}
