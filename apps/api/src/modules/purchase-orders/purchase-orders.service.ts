import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalDecision,
  ApprovalTarget,
  EntityType,
  NotificationEvent,
  Prisma,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  QuotationStatus,
  RfqStatus,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { ApprovalRoutingService } from '../approvals/approval-routing.service';
import { AuthUser } from '../../common/decorators';
import { paginate } from '../../common/dto/pagination.dto';
import { countByStatus } from '../../common/status-counts';
import {
  CancelPurchaseOrderDto,
  CreateFromRequestDto,
  CreateFromRfqDto,
  PurchaseOrderItemDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

/** Only a draft may still be edited; everything later is a committed order. */
const EDITABLE: PurchaseOrderStatus[] = [PurchaseOrderStatus.DRAFT];

/**
 * Sửa được cả đơn đang chờ duyệt và đơn đã duyệt nhưng chưa phát hành — sửa
 * xong thì chuỗi duyệt chạy lại từ cấp đầu, vì người đã duyệt trước đó duyệt
 * một nội dung khác.
 */
const REVISABLE: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.PENDING_APPROVAL,
  PurchaseOrderStatus.APPROVED,
];

/** Các trường trên phần đầu đơn được theo dõi thay đổi. */
const TRACKED_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: 'Tiêu đề' },
  { key: 'taxRate', label: 'Thuế VAT (%)' },
  { key: 'paymentTerm', label: 'Điều khoản thanh toán' },
  { key: 'incoterm', label: 'Incoterm' },
  { key: 'deliveryTerm', label: 'Điều kiện giao hàng' },
  { key: 'warranty', label: 'Bảo hành' },
  { key: 'deliveryDate', label: 'Ngày giao hàng' },
  { key: 'deliveryAddress', label: 'Địa chỉ giao hàng' },
  { key: 'note', label: 'Ghi chú' },
];

/**
 * Chỉ phát hành được đơn đã qua đủ các cấp duyệt. Đơn không rơi vào quy trình
 * nào thì lúc trình duyệt đã tự chuyển sang APPROVED.
 */
const ISSUABLE: PurchaseOrderStatus[] = [PurchaseOrderStatus.APPROVED];

const DETAIL_INCLUDE = {
  purchaseRequest: {
    select: {
      id: true,
      code: true,
      title: true,
      department: { select: { id: true, name: true } },
      requester: { select: { id: true, fullName: true, email: true } },
    },
  },
  rfq: { select: { id: true, code: true, title: true } },
  quotation: { select: { id: true, code: true, totalAmount: true } },
  supplier: true,
  buyer: { select: { id: true, fullName: true, email: true } },
  items: { orderBy: { lineNo: 'asc' } },
  attachments: { where: { deletedAt: null } },
  approvalWorkflow: {
    select: {
      id: true,
      name: true,
      steps: {
        orderBy: { stepOrder: 'asc' },
        select: {
          id: true,
          stepOrder: true,
          name: true,
          role: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  currentStep: {
    select: {
      id: true,
      stepOrder: true,
      name: true,
      role: { select: { id: true, code: true, name: true } },
    },
  },
  approvalHistories: {
    orderBy: { createdAt: 'desc' },
    include: {
      actor: { select: { id: true, fullName: true } },
      step: { select: { id: true, name: true, stepOrder: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly codes: CodeGeneratorService,
    private readonly routing: ApprovalRoutingService,
  ) {}

  /** Điều kiện lọc dùng chung cho danh sách và cho phần đếm theo trạng thái. */
  private listWhere(
    dto: QueryPurchaseOrderDto,
    user: AuthUser,
    opts: { ignoreStatus?: boolean } = {},
  ): Prisma.PurchaseOrderWhereInput {
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      ...(dto.status && !opts.ignoreStatus ? { status: dto.status } : {}),
      ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
      ...(dto.rfqId ? { rfqId: dto.rfqId } : {}),
      ...(dto.purchaseRequestId
        ? { purchaseRequestId: dto.purchaseRequestId }
        : {}),
      ...(dto.search
        ? {
            OR: [
              { code: { contains: dto.search, mode: 'insensitive' } },
              { title: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // A supplier only ever sees orders addressed to it, and never buyer drafts.
    if (user.supplierId) {
      where.supplierId = user.supplierId;
      if (!where.status) where.status = { not: PurchaseOrderStatus.DRAFT };
    }

    return where;
  }

  /** Số đơn hàng theo từng trạng thái, trên đúng bộ lọc trừ bộ lọc trạng thái. */
  async statusCounts(dto: QueryPurchaseOrderDto, user: AuthUser) {
    return countByStatus(
      this.prisma.purchaseOrder,
      this.listWhere(dto, user, { ignoreStatus: true }),
      PurchaseOrderStatus,
    );
  }

  async findAll(dto: QueryPurchaseOrderDto, user: AuthUser) {
    const where = this.listWhere(dto, user);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { [dto.sortBy]: dto.sortOrder },
        include: {
          supplier: { select: { id: true, code: true, companyName: true } },
          buyer: { select: { id: true, fullName: true } },
          purchaseRequest: { select: { id: true, code: true, title: true } },
          rfq: { select: { id: true, code: true } },
          quotation: { select: { id: true, code: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string, user: AuthUser) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Purchase order not found');

    if (user.supplierId) {
      if (order.supplierId !== user.supplierId) {
        throw new ForbiddenException('You cannot access this purchase order');
      }
      if (order.status === PurchaseOrderStatus.DRAFT) {
        throw new ForbiddenException('This purchase order has not been issued');
      }
    }

    return order;
  }

  /**
   * Generates an order from one winning quotation of an awarded RFQ. When the
   * RFQ was split across suppliers, each winner gets its own order carrying
   * only the lines it won — so one purchase request can yield several orders.
   * Lines and unit prices are copied now, so the order records the agreed price.
   */
  async createFromRfq(dto: CreateFromRfqDto, user: AuthUser) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: dto.rfqId, deletedAt: null },
      include: {
        purchaseRequest: true,
        quotations: {
          where: { deletedAt: null, status: QuotationStatus.AWARDED },
          include: { items: { orderBy: { lineNo: 'asc' } } },
        },
      },
    });

    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status !== RfqStatus.AWARDED || !rfq.quotations.length) {
      throw new BadRequestException(
        'Chỉ tạo được đơn hàng từ RFQ đã chọn nhà cung cấp trúng thầu',
      );
    }

    // With several winners the caller must say which one this order is for.
    const quotation = dto.quotationId
      ? rfq.quotations.find((q) => q.id === dto.quotationId)
      : rfq.quotations.length === 1
        ? rfq.quotations[0]
        : null;

    if (!quotation) {
      throw new BadRequestException(
        dto.quotationId
          ? 'Báo giá được chọn không trúng thầu trong RFQ này'
          : `RFQ này có ${rfq.quotations.length} nhà cung cấp trúng thầu, cần chọn rõ báo giá để tạo đơn`,
      );
    }

    const existing = await this.prisma.purchaseOrder.findFirst({
      where: {
        rfqId: rfq.id,
        quotationId: quotation.id,
        deletedAt: null,
        status: { not: PurchaseOrderStatus.CANCELLED },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Báo giá này đã có đơn hàng ${existing.code}`,
      );
    }

    // Only the lines this supplier actually won belong on its order.
    const awardedLines = quotation.items.filter((i) => i.isAwarded);
    if (!awardedLines.length) {
      throw new BadRequestException(
        'Báo giá này không có dòng hàng nào trúng thầu',
      );
    }

    // Đánh số lại từ 1: khi chia thầu, đơn hàng chỉ giữ vài dòng của báo giá
    // nên số thứ tự gốc sẽ bị ngắt quãng.
    const items = this.normaliseItems(
      dto.items ??
        awardedLines.map((item, index) => ({
          lineNo: index + 1,
          materialId: item.materialId ?? undefined,
          name: item.name,
          description: item.description ?? undefined,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
        })),
    );

    return this.persist(
      {
        title: dto.title ?? rfq.title,
        purchaseRequestId: rfq.purchaseRequestId,
        rfqId: rfq.id,
        quotationId: quotation.id,
        supplierId: quotation.supplierId,
        currency: quotation.currency,
        paymentTerm: dto.paymentTerm ?? quotation.paymentTerm,
        incoterm: dto.incoterm ?? quotation.incoterm,
        deliveryTerm: dto.deliveryTerm ?? quotation.deliveryTerm,
        warranty: dto.warranty ?? quotation.warranty,
      },
      dto,
      items,
      user,
    );
  }

  /** Direct order for purchases that never went through an RFQ. */
  async createFromRequest(dto: CreateFromRequestDto, user: AuthUser) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id: dto.purchaseRequestId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Purchase request not found');
    if (request.status !== PurchaseRequestStatus.APPROVED) {
      throw new BadRequestException(
        'Chỉ tạo được đơn hàng từ yêu cầu mua hàng đã được duyệt',
      );
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: dto.supplierId,
        deletedAt: null,
        status: SupplierStatus.APPROVED,
      },
    });
    if (!supplier) {
      throw new BadRequestException(
        'Nhà cung cấp không tồn tại hoặc chưa được duyệt',
      );
    }

    return this.persist(
      {
        title: dto.title ?? request.title,
        purchaseRequestId: request.id,
        rfqId: null,
        quotationId: null,
        supplierId: supplier.id,
        currency: dto.currency ?? request.currency,
        paymentTerm: dto.paymentTerm ?? supplier.paymentTerm,
        incoterm: dto.incoterm,
        deliveryTerm: dto.deliveryTerm,
        warranty: dto.warranty,
      },
      dto,
      this.normaliseItems(dto.items),
      user,
    );
  }

  /**
   * Sửa đơn hàng. Nếu đơn đã trình duyệt hoặc đã duyệt xong thì mọi thay đổi
   * đều đưa nó về nháp và xóa chuỗi duyệt cũ — người đã ký ở cấp trước duyệt
   * một nội dung khác, không thể coi là vẫn còn hiệu lực.
   */
  async update(id: string, dto: UpdatePurchaseOrderDto, user: AuthUser) {
    const current = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { items: { orderBy: { lineNo: 'asc' } } },
    });
    if (!current) throw new NotFoundException('Purchase order not found');
    if (!REVISABLE.includes(current.status)) {
      throw new BadRequestException(
        'Đơn đã phát hành cho nhà cung cấp thì không sửa được nữa, hãy hủy và lập đơn mới',
      );
    }

    const items = dto.items ? this.normaliseItems(dto.items) : null;
    const taxRate = dto.taxRate ?? Number(current.taxRate);
    const totals = items
      ? this.totals(items, taxRate)
      : this.totals(current.items, taxRate);

    const changes = this.diff(current, dto, items, totals);
    if (!changes.length) {
      throw new BadRequestException('Chưa có thay đổi nào so với bản hiện tại');
    }

    // Đơn mới lập vẫn ở nháp thì sửa thoải mái, không cần ghi bản chỉnh sửa.
    const needsReapproval = current.status !== PurchaseOrderStatus.DRAFT;

    const order = await this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
      }

      if (needsReapproval) {
        const last = await tx.purchaseOrderRevision.findFirst({
          where: { purchaseOrderId: id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.purchaseOrderRevision.create({
          data: {
            purchaseOrderId: id,
            version: (last?.version ?? 0) + 1,
            changedById: user.id,
            changes: changes,
            previousStatus: current.status,
            note: dto.note,
          },
        });
        await tx.approvalHistory.create({
          data: {
            purchaseOrderId: id,
            actorId: user.id,
            decision: ApprovalDecision.PENDING,
            fromStatus: current.status,
            toStatus: PurchaseOrderStatus.DRAFT,
            comment: `Đơn được chỉnh sửa (${changes.length} thay đổi), phải trình duyệt lại từ đầu`,
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          title: dto.title,
          taxRate: dto.taxRate,
          paymentTerm: dto.paymentTerm,
          incoterm: dto.incoterm,
          deliveryTerm: dto.deliveryTerm,
          warranty: dto.warranty,
          deliveryDate: dto.deliveryDate
            ? new Date(dto.deliveryDate)
            : undefined,
          deliveryAddress: dto.deliveryAddress,
          note: dto.note,
          ...totals,
          ...(items ? { items: { create: items } } : {}),
          ...(needsReapproval
            ? {
                status: PurchaseOrderStatus.DRAFT,
                approvalWorkflowId: null,
                currentStepId: null,
                submittedForApprovalAt: null,
                approvedAt: null,
              }
            : {}),
        },
        include: DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      module: 'purchase_order',
      entityId: id,
      oldValue: {
        status: current.status,
        totalAmount: current.totalAmount.toString(),
      },
      newValue: {
        status: order.status,
        totalAmount: order.totalAmount.toString(),
        changes: changes.length,
        reapprovalRequired: needsReapproval,
      },
    });

    return order;
  }

  /** Lịch sử chỉnh sửa của một đơn, mới nhất trước. */
  async revisions(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.purchaseOrderRevision.findMany({
      where: { purchaseOrderId: id },
      orderBy: { version: 'desc' },
      include: { changedBy: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * So bản hiện tại với dữ liệu gửi lên, trả về đúng những gì thực sự đổi.
   * Dòng hàng so theo số thứ tự để nêu rõ dòng nào thêm, sửa hay bỏ.
   */
  private diff(
    current: {
      items: {
        lineNo: number;
        name: string;
        quantity: Prisma.Decimal;
        unit: string;
        unitPrice: Prisma.Decimal;
      }[];
    } & Record<string, unknown>,
    dto: UpdatePurchaseOrderDto,
    items: ReturnType<PurchaseOrdersService['normaliseItems']> | null,
    totals: {
      subtotal: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    },
  ) {
    const text = (v: unknown): string => {
      if (v === null || v === undefined || v === '') return '—';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'object')
        return (v as { toString(): string }).toString();
      if (typeof v === 'string') return v;
      if (
        typeof v === 'number' ||
        typeof v === 'bigint' ||
        typeof v === 'boolean'
      )
        return v.toString();
      return '—';
    };

    const changes: {
      field: string;
      label: string;
      before: string;
      after: string;
    }[] = [];

    for (const { key, label } of TRACKED_FIELDS) {
      const next = (dto as Record<string, unknown>)[key];
      if (next === undefined) continue;
      const before = text(current[key]);
      const after = text(
        key === 'deliveryDate' && next ? new Date(next as string) : next,
      );
      if (before !== after) changes.push({ field: key, label, before, after });
    }

    if (items) {
      const byLine = new Map(current.items.map((i) => [i.lineNo, i]));
      const seen = new Set<number>();
      for (const item of items) {
        seen.add(item.lineNo);
        const old = byLine.get(item.lineNo);
        const label = `Dòng ${item.lineNo}: ${item.name}`;
        if (!old) {
          changes.push({
            field: `item.${item.lineNo}`,
            label,
            before: '—',
            after: `${text(item.quantity)} ${item.unit} × ${text(item.unitPrice)}`,
          });
          continue;
        }
        const oldText = `${text(old.quantity)} ${old.unit} × ${text(old.unitPrice)}`;
        const newText = `${text(item.quantity)} ${item.unit} × ${text(item.unitPrice)}`;
        if (old.name !== item.name) {
          changes.push({
            field: `item.${item.lineNo}.name`,
            label: `Dòng ${item.lineNo} — tên hàng`,
            before: old.name,
            after: item.name,
          });
        }
        if (oldText !== newText) {
          changes.push({
            field: `item.${item.lineNo}`,
            label,
            before: oldText,
            after: newText,
          });
        }
      }
      for (const old of current.items) {
        if (seen.has(old.lineNo)) continue;
        changes.push({
          field: `item.${old.lineNo}`,
          label: `Dòng ${old.lineNo}: ${old.name}`,
          before: `${text(old.quantity)} ${old.unit} × ${text(old.unitPrice)}`,
          after: 'đã bỏ',
        });
      }
    }

    const beforeTotal = text(current.totalAmount);
    const afterTotal = text(totals.totalAmount);
    if (beforeTotal !== afterTotal) {
      changes.push({
        field: 'totalAmount',
        label: 'Tổng cộng',
        before: beforeTotal,
        after: afterTotal,
      });
    }

    return changes;
  }

  /**
   * Trình đơn hàng đi duyệt. Chuỗi duyệt được chốt ngay tại đây theo giá trị
   * đơn, nên sửa cấu hình về sau không làm lệch các đơn đang chạy dở. Không có
   * quy trình nào khớp thì đơn được duyệt luôn, khỏi chặn ngang quy trình.
   */
  async submitForApproval(id: string, user: AuthUser) {
    const current = await this.requireStatus(
      id,
      EDITABLE,
      'Chỉ trình duyệt được đơn ở trạng thái nháp',
    );

    const itemCount = await this.prisma.purchaseOrderItem.count({
      where: { purchaseOrderId: id },
    });
    if (itemCount === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất một dòng hàng');
    }

    const workflow = await this.routing.resolve({
      amount: current.totalAmount,
      appliesTo: ApprovalTarget.PURCHASE_ORDER,
    });

    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data: workflow
        ? {
            status: PurchaseOrderStatus.PENDING_APPROVAL,
            approvalWorkflowId: workflow.workflowId,
            currentStepId: workflow.steps[0].id,
            submittedForApprovalAt: new Date(),
          }
        : {
            status: PurchaseOrderStatus.APPROVED,
            submittedForApprovalAt: new Date(),
            approvedAt: new Date(),
          },
      include: DETAIL_INCLUDE,
    });

    await this.prisma.approvalHistory.create({
      data: {
        purchaseOrderId: id,
        actorId: user.id,
        decision: ApprovalDecision.PENDING,
        fromStatus: current.status,
        toStatus: order.status,
        comment: workflow
          ? `Trình duyệt theo quy trình "${workflow.name}" (${workflow.steps.length} cấp)`
          : 'Không có quy trình duyệt phù hợp, đơn được duyệt tự động',
      },
    });

    if (workflow) {
      await this.notifyApprovers(
        order.id,
        workflow.steps[0].roleId,
        order.code,
      );
    }

    await this.audit.record({
      userId: user.id,
      action: 'SUBMIT_FOR_APPROVAL',
      module: 'purchase_order',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: order.status, workflow: workflow?.name ?? null },
    });

    return this.detail(id);
  }

  /**
   * Duyệt đúng một cấp. Chỉ người giữ vai trò của cấp đang chờ mới duyệt được,
   * và các cấp phải đi lần lượt — duyệt xong cấp này mới mở cấp sau.
   */
  async approveStep(id: string, comment: string | undefined, user: AuthUser) {
    const { order, step } = await this.requirePendingStep(id, user);

    const next = await this.routing.nextStep(
      order.approvalWorkflowId!,
      step.stepOrder,
    );
    const done = !next;

    await this.prisma.$transaction([
      this.prisma.purchaseOrder.update({
        where: { id },
        data: done
          ? {
              status: PurchaseOrderStatus.APPROVED,
              currentStepId: null,
              approvedAt: new Date(),
            }
          : { currentStepId: next.id },
      }),
      this.prisma.approvalHistory.create({
        data: {
          purchaseOrderId: id,
          stepId: step.id,
          actorId: user.id,
          decision: ApprovalDecision.APPROVED,
          comment,
          fromStatus: order.status,
          toStatus: done
            ? PurchaseOrderStatus.APPROVED
            : PurchaseOrderStatus.PENDING_APPROVAL,
        },
      }),
    ]);

    if (done) {
      await this.notifications.notify({
        userIds: [order.buyerId],
        event: NotificationEvent.PO_ISSUED,
        title: `Đơn hàng ${order.code} đã được duyệt`,
        body: 'Đơn hàng đã qua đủ các cấp duyệt, bạn có thể phát hành cho nhà cung cấp.',
        link: `/purchase-orders/${order.id}`,
        entityType: EntityType.PURCHASE_ORDER,
        entityId: order.id,
      });
    } else {
      await this.notifyApprovers(order.id, next.roleId, order.code);
    }

    await this.audit.record({
      userId: user.id,
      action: 'APPROVE_STEP',
      module: 'purchase_order',
      entityId: id,
      newValue: { step: step.name, done },
    });

    return this.detail(id);
  }

  async rejectApproval(id: string, reason: string, user: AuthUser) {
    if (!reason?.trim()) {
      throw new BadRequestException('Phải nhập lý do từ chối');
    }
    const { order, step } = await this.requirePendingStep(id, user);

    await this.prisma.$transaction([
      this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          // Trả về nháp để người lập sửa rồi trình lại, thay vì hủy hẳn đơn.
          status: PurchaseOrderStatus.DRAFT,
          currentStepId: null,
          approvalWorkflowId: null,
          submittedForApprovalAt: null,
        },
      }),
      this.prisma.approvalHistory.create({
        data: {
          purchaseOrderId: id,
          stepId: step.id,
          actorId: user.id,
          decision: ApprovalDecision.REJECTED,
          comment: reason,
          fromStatus: order.status,
          toStatus: PurchaseOrderStatus.DRAFT,
        },
      }),
    ]);

    await this.notifications.notify({
      userIds: [order.buyerId],
      event: NotificationEvent.PO_CANCELLED,
      title: `Đơn hàng ${order.code} bị trả lại ở cấp "${step.name}"`,
      body: reason,
      link: `/purchase-orders/${order.id}`,
      entityType: EntityType.PURCHASE_ORDER,
      entityId: order.id,
    });

    await this.audit.record({
      userId: user.id,
      action: 'REJECT_APPROVAL',
      module: 'purchase_order',
      entityId: id,
      newValue: { step: step.name, reason },
    });

    return this.detail(id);
  }

  /** Các đơn đang chờ chính người này duyệt. */
  async pendingForMe(user: AuthUser) {
    const roleIds = await this.roleIdsOf(user);
    if (!roleIds.length) return [];
    return this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        status: PurchaseOrderStatus.PENDING_APPROVAL,
        currentStep: { roleId: { in: roleIds } },
      },
      orderBy: { submittedForApprovalAt: 'asc' },
      include: {
        supplier: { select: { id: true, code: true, companyName: true } },
        buyer: { select: { id: true, fullName: true } },
        currentStep: { select: { id: true, name: true, stepOrder: true } },
        approvalWorkflow: { select: { id: true, name: true } },
      },
    });
  }

  async issue(id: string, user: AuthUser) {
    const current = await this.requireStatus(
      id,
      ISSUABLE,
      'Đơn hàng phải được duyệt xong mới phát hành được',
    );

    const itemCount = await this.prisma.purchaseOrderItem.count({
      where: { purchaseOrderId: id },
    });
    if (itemCount === 0) {
      throw new BadRequestException('Đơn hàng phải có ít nhất một dòng hàng');
    }

    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ISSUED, issuedAt: new Date() },
      include: DETAIL_INCLUDE,
    });

    await this.notifySupplier(
      order.supplierId,
      NotificationEvent.PO_ISSUED,
      `Đơn hàng mới: ${order.code}`,
      `${order.buyer.fullName} đã phát hành đơn hàng "${order.title}" trị giá ${order.totalAmount.toString()} ${order.currency}.`,
      `/supplier/purchase-orders/${order.id}`,
      order.id,
    );

    await this.audit.record({
      userId: user.id,
      action: 'ISSUE',
      module: 'purchase_order',
      entityId: id,
      oldValue: { status: current.status },
      newValue: {
        status: order.status,
        totalAmount: order.totalAmount.toString(),
      },
    });

    return order;
  }

  /** The supplier confirms it accepts the order. */
  async acknowledge(id: string, user: AuthUser) {
    if (!user.supplierId) {
      throw new ForbiddenException(
        'Chỉ nhà cung cấp mới xác nhận được đơn hàng',
      );
    }

    const current = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Purchase order not found');
    if (current.supplierId !== user.supplierId) {
      throw new ForbiddenException('Đơn hàng này không thuộc về bạn');
    }
    if (current.status !== PurchaseOrderStatus.ISSUED) {
      throw new BadRequestException('Chỉ xác nhận được đơn đã phát hành');
    }

    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
      },
      include: DETAIL_INCLUDE,
    });

    await this.notifications.notify({
      userIds: [order.buyerId],
      event: NotificationEvent.PO_ACKNOWLEDGED,
      title: `${order.supplier.companyName} đã xác nhận ${order.code}`,
      body: `Nhà cung cấp đã xác nhận đơn hàng "${order.title}".`,
      link: `/purchase-orders/${order.id}`,
      entityType: EntityType.PURCHASE_ORDER,
      entityId: order.id,
    });

    await this.audit.record({
      userId: user.id,
      action: 'ACKNOWLEDGE',
      module: 'purchase_order',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: order.status },
    });

    return order;
  }

  async complete(id: string, user: AuthUser) {
    const current = await this.requireStatus(
      id,
      [
        PurchaseOrderStatus.ACKNOWLEDGED,
        PurchaseOrderStatus.ISSUED,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
      ],
      'Đơn hàng chưa ở trạng thái có thể hoàn thành',
    );

    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.COMPLETED, completedAt: new Date() },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'COMPLETE',
      module: 'purchase_order',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: order.status },
    });

    return order;
  }

  async cancel(id: string, dto: CancelPurchaseOrderDto, user: AuthUser) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Phải nhập lý do hủy đơn hàng');
    }

    const current = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Purchase order not found');
    if (
      current.status === PurchaseOrderStatus.COMPLETED ||
      current.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Đơn hàng đã kết thúc, không thể hủy');
    }

    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
      include: DETAIL_INCLUDE,
    });

    // Only tell the supplier about orders it had already been sent.
    if (current.status !== PurchaseOrderStatus.DRAFT) {
      await this.notifySupplier(
        order.supplierId,
        NotificationEvent.PO_CANCELLED,
        `Đơn hàng ${order.code} đã bị hủy`,
        dto.reason,
        `/supplier/purchase-orders/${order.id}`,
        order.id,
      );
    }

    await this.audit.record({
      userId: user.id,
      action: 'CANCEL',
      module: 'purchase_order',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: order.status, reason: dto.reason },
    });

    return order;
  }

  async remove(id: string, user: AuthUser) {
    const current = await this.requireStatus(
      id,
      EDITABLE,
      'Chỉ xóa được đơn ở trạng thái nháp',
    );

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      userId: user.id,
      action: 'DELETE',
      module: 'purchase_order',
      entityId: id,
      oldValue: { code: current.code, status: current.status },
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------

  private async persist(
    base: {
      title: string;
      purchaseRequestId: string;
      rfqId: string | null;
      quotationId: string | null;
      supplierId: string;
      currency: string;
      paymentTerm?: string | null;
      incoterm?: string | null;
      deliveryTerm?: string | null;
      warranty?: string | null;
    },
    dto: {
      taxRate?: number;
      deliveryDate?: string;
      deliveryAddress?: string;
      note?: string;
    },
    items: ReturnType<PurchaseOrdersService['normaliseItems']>,
    user: AuthUser,
  ) {
    const taxRate = dto.taxRate ?? 0;
    const code = await this.codes.next('PO');

    const order = await this.prisma.purchaseOrder.create({
      data: {
        code,
        ...base,
        buyerId: user.id,
        status: PurchaseOrderStatus.DRAFT,
        taxRate,
        ...this.totals(items, taxRate),
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        deliveryAddress: dto.deliveryAddress,
        note: dto.note,
        items: { create: items },
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'CREATE',
      module: 'purchase_order',
      entityId: order.id,
      newValue: {
        code: order.code,
        supplierId: order.supplierId,
        totalAmount: order.totalAmount.toString(),
      },
    });

    return order;
  }

  /**
   * Đơn phải đang chờ duyệt, và người bấm phải giữ đúng vai trò của cấp hiện
   * tại — đây là chỗ ép các cấp đi tuần tự.
   */
  private async requirePendingStep(id: string, user: AuthUser) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        currentStep: { include: { role: true } },
      },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (
      order.status !== PurchaseOrderStatus.PENDING_APPROVAL ||
      !order.currentStep
    ) {
      throw new BadRequestException(
        'Đơn hàng này không ở trạng thái chờ duyệt',
      );
    }

    const step = order.currentStep;
    const roleIds = await this.roleIdsOf(user);
    if (step.roleId && !roleIds.includes(step.roleId)) {
      throw new ForbiddenException(
        `Đơn đang chờ duyệt ở cấp "${step.name}" (vai trò ${
          step.role?.name ?? 'được chỉ định'
        }), bạn không duyệt được cấp này`,
      );
    }
    return { order, step };
  }

  /** Vai trò nằm ở bảng userRole, token chỉ mang mã vai trò dạng chuỗi. */
  private async roleIdsOf(user: AuthUser): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true },
    });
    return roles.map((r) => r.roleId);
  }

  private detail(id: string) {
    return this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }

  /** Báo cho tất cả người giữ vai trò của cấp đang chờ. */
  private async notifyApprovers(
    orderId: string,
    roleId: string | null,
    code: string,
  ) {
    if (!roleId) return;
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, roles: { some: { roleId } } },
      select: { id: true },
    });
    if (!users.length) return;
    await this.notifications.notify({
      userIds: users.map((u) => u.id),
      event: NotificationEvent.PO_ISSUED,
      title: `Đơn hàng ${code} chờ bạn duyệt`,
      body: 'Một đơn hàng đã tới cấp duyệt của bạn.',
      link: `/purchase-orders/${orderId}`,
      entityType: EntityType.PURCHASE_ORDER,
      entityId: orderId,
    });
  }

  private async requireStatus(
    id: string,
    allowed: PurchaseOrderStatus[],
    message: string,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (!allowed.includes(order.status)) throw new BadRequestException(message);
    return order;
  }

  private normaliseItems(items: PurchaseOrderItemDto[]) {
    if (!items.length) {
      throw new BadRequestException('Đơn hàng phải có ít nhất một dòng hàng');
    }
    return items.map((item, index) => {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      return {
        lineNo: item.lineNo ?? index + 1,
        materialId: item.materialId ?? null,
        name: item.name,
        description: item.description,
        specification: item.specification,
        quantity,
        unit: item.unit,
        unitPrice,
        lineTotal: unitPrice.mul(quantity),
      };
    });
  }

  private totals(items: { lineTotal: Prisma.Decimal }[], taxRate: number) {
    const subtotal = items.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );
    const taxAmount = subtotal.mul(taxRate).div(100);
    return {
      subtotal,
      taxAmount,
      totalAmount: subtotal.add(taxAmount),
    };
  }

  private async notifySupplier(
    supplierId: string,
    event: NotificationEvent,
    title: string,
    body: string,
    link: string,
    entityId: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { supplierId, deletedAt: null },
      select: { id: true },
    });
    await this.notifications.notify({
      userIds: users.map((u) => u.id),
      event,
      title,
      body,
      link,
      entityType: EntityType.PURCHASE_ORDER,
      entityId,
    });
  }
}
