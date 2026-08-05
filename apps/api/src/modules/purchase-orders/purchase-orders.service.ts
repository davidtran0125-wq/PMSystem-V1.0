import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntityType,
  NotificationEvent,
  Prisma,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  RfqStatus,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { AuthUser } from '../../common/decorators';
import { paginate } from '../../common/dto/pagination.dto';
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
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async findAll(dto: QueryPurchaseOrderDto, user: AuthUser) {
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
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
      where.status = { not: PurchaseOrderStatus.DRAFT };
    }

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
   * Generates the order from the winning quotation of an awarded RFQ. Lines and
   * unit prices are copied at this moment so the order records the price that
   * was actually agreed.
   */
  async createFromRfq(dto: CreateFromRfqDto, user: AuthUser) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: dto.rfqId, deletedAt: null },
      include: {
        purchaseRequest: true,
        awardedQuotation: { include: { items: { orderBy: { lineNo: 'asc' } } } },
      },
    });

    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status !== RfqStatus.AWARDED || !rfq.awardedQuotation) {
      throw new BadRequestException(
        'Chỉ tạo được đơn hàng từ RFQ đã chọn nhà cung cấp trúng thầu',
      );
    }

    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { rfqId: rfq.id, deletedAt: null, status: { not: PurchaseOrderStatus.CANCELLED } },
    });
    if (existing) {
      throw new BadRequestException(
        `RFQ này đã có đơn hàng ${existing.code}`,
      );
    }

    const quotation = rfq.awardedQuotation;
    const items = this.normaliseItems(
      dto.items ??
        quotation.items.map((item) => ({
          lineNo: item.lineNo,
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
      throw new BadRequestException('Nhà cung cấp không tồn tại hoặc chưa được duyệt');
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

  async update(id: string, dto: UpdatePurchaseOrderDto, user: AuthUser) {
    const current = await this.requireStatus(id, EDITABLE, 'Chỉ sửa được đơn ở trạng thái nháp');

    const items = dto.items ? this.normaliseItems(dto.items) : null;
    const taxRate = dto.taxRate ?? Number(current.taxRate);
    const totals = items
      ? this.totals(items, taxRate)
      : this.totals(
          (
            await this.prisma.purchaseOrderItem.findMany({
              where: { purchaseOrderId: id },
            })
          ).map((i) => ({ ...i, lineTotal: i.lineTotal })),
          taxRate,
        );

    const order = await this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
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
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          deliveryAddress: dto.deliveryAddress,
          note: dto.note,
          ...totals,
          ...(items ? { items: { create: items } } : {}),
        },
        include: DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      module: 'purchase_order',
      entityId: id,
      oldValue: { totalAmount: current.totalAmount.toString() },
      newValue: { totalAmount: order.totalAmount.toString() },
    });

    return order;
  }

  async issue(id: string, user: AuthUser) {
    const current = await this.requireStatus(
      id,
      EDITABLE,
      'Đơn hàng này đã được phát hành',
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
      newValue: { status: order.status, totalAmount: order.totalAmount.toString() },
    });

    return order;
  }

  /** The supplier confirms it accepts the order. */
  async acknowledge(id: string, user: AuthUser) {
    if (!user.supplierId) {
      throw new ForbiddenException('Chỉ nhà cung cấp mới xác nhận được đơn hàng');
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
    dto: { taxRate?: number; deliveryDate?: string; deliveryAddress?: string; note?: string },
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
