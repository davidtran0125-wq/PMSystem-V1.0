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
  PurchaseRequestStatus,
  QuotationStatus,
  RfqStatus,
  RfqSupplierStatus,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { AuthUser } from '../../common/decorators';
import { paginate } from '../../common/dto/pagination.dto';
import {
  AwardRfqDto,
  CreateRfqDto,
  QueryRfqDto,
  SubmitQuotationDto,
  UpdateRfqDto,
} from './dto/rfq.dto';

const RFQ_DETAIL_INCLUDE = {
  purchaseRequest: {
    include: {
      category: true,
      department: true,
      items: { orderBy: { lineNo: 'asc' } },
      requester: { select: { id: true, fullName: true, email: true } },
    },
  },
  buyer: { select: { id: true, fullName: true, email: true } },
  suppliers: { include: { supplier: true } },
  quotations: {
    where: { deletedAt: null },
    include: {
      supplier: true,
      items: { orderBy: { lineNo: 'asc' } },
      attachments: { where: { deletedAt: null } },
    },
  },
  attachments: { where: { deletedAt: null } },
} satisfies Prisma.RfqInclude;

@Injectable()
export class RfqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async findAll(dto: QueryRfqDto, user: AuthUser) {
    const where: Prisma.RfqWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.search
        ? {
            OR: [
              { code: { contains: dto.search, mode: 'insensitive' } },
              { title: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Suppliers only ever see the RFQs they were invited to, and never drafts.
    if (user.supplierId) {
      where.suppliers = { some: { supplierId: user.supplierId } };
      where.status = { not: RfqStatus.DRAFT };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.rfq.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { [dto.sortBy]: dto.sortOrder },
        include: {
          purchaseRequest: {
            select: { id: true, code: true, title: true, categoryId: true },
          },
          buyer: { select: { id: true, fullName: true } },
          _count: { select: { suppliers: true, quotations: true } },
        },
      }),
      this.prisma.rfq.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string, user: AuthUser) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, deletedAt: null },
      include: RFQ_DETAIL_INCLUDE,
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    if (user.supplierId) {
      const invited = rfq.suppliers.some(
        (s) => s.supplierId === user.supplierId,
      );
      if (!invited || rfq.status === RfqStatus.DRAFT) {
        throw new ForbiddenException('You were not invited to this RFQ');
      }

      // A supplier must never see competitor pricing.
      return {
        ...rfq,
        quotations: rfq.quotations.filter(
          (q) => q.supplierId === user.supplierId,
        ),
      };
    }

    return rfq;
  }

  async create(dto: CreateRfqDto, user: AuthUser) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id: dto.purchaseRequestId, deletedAt: null },
    });
    if (!request) throw new NotFoundException('Purchase request not found');
    if (request.status !== PurchaseRequestStatus.APPROVED) {
      throw new BadRequestException(
        'Only an approved purchase request can be turned into an RFQ',
      );
    }

    await this.assertSuppliersInvitable(dto.supplierIds);
    const code = await this.codes.next('RFQ');

    const rfq = await this.prisma.rfq.create({
      data: {
        code,
        title: dto.title ?? request.title,
        purchaseRequestId: request.id,
        buyerId: user.id,
        instructions: dto.instructions,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: RfqStatus.DRAFT,
        suppliers: {
          create: dto.supplierIds.map((supplierId) => ({ supplierId })),
        },
      },
      include: RFQ_DETAIL_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'CREATE',
      module: 'rfq',
      entityId: rfq.id,
      newValue: { code: rfq.code, suppliers: dto.supplierIds.length },
    });

    return rfq;
  }

  async update(id: string, dto: UpdateRfqDto, user: AuthUser) {
    const current = await this.requireDraft(id);

    if (dto.supplierIds) {
      await this.assertSuppliersInvitable(dto.supplierIds);
    }

    const rfq = await this.prisma.$transaction(async (tx) => {
      if (dto.supplierIds) {
        await tx.rfqSupplier.deleteMany({ where: { rfqId: id } });
        await tx.rfqSupplier.createMany({
          data: dto.supplierIds.map((supplierId) => ({
            rfqId: id,
            supplierId,
          })),
        });
      }

      return tx.rfq.update({
        where: { id },
        data: {
          title: dto.title,
          instructions: dto.instructions,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
        include: RFQ_DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      module: 'rfq',
      entityId: id,
      oldValue: { title: current.title },
      newValue: { title: rfq.title },
    });

    return rfq;
  }

  async send(id: string, user: AuthUser) {
    const current = await this.requireDraft(id);

    const invited = await this.prisma.rfqSupplier.count({
      where: { rfqId: id },
    });
    if (invited === 0) {
      throw new BadRequestException(
        'Invite at least one supplier before sending',
      );
    }

    const rfq = await this.prisma.rfq.update({
      where: { id },
      data: { status: RfqStatus.SENT, sentAt: new Date() },
      include: RFQ_DETAIL_INCLUDE,
    });

    const supplierIds = rfq.suppliers.map((s) => s.supplierId);
    const supplierUsers = await this.prisma.user.findMany({
      where: { supplierId: { in: supplierIds }, deletedAt: null },
      select: { id: true },
    });

    await this.notifications.notify({
      userIds: supplierUsers.map((u) => u.id),
      event: NotificationEvent.RFQ_SENT,
      title: `Yêu cầu báo giá mới: ${rfq.code}`,
      body: `Bạn được mời báo giá cho "${rfq.title}".${
        rfq.dueDate
          ? ` Hạn nộp: ${rfq.dueDate.toLocaleDateString('vi-VN')}.`
          : ''
      }`,
      link: `/supplier/rfqs/${rfq.id}`,
      entityType: EntityType.RFQ,
      entityId: rfq.id,
    });

    await this.audit.record({
      userId: user.id,
      action: 'SEND',
      module: 'rfq',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: rfq.status, suppliers: supplierIds.length },
    });

    return rfq;
  }

  async close(id: string, user: AuthUser) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, deletedAt: null },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status !== RfqStatus.SENT) {
      throw new BadRequestException('Only a sent RFQ can be closed');
    }

    const updated = await this.prisma.rfq.update({
      where: { id },
      data: { status: RfqStatus.CLOSED, closedAt: new Date() },
      include: RFQ_DETAIL_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'CLOSE',
      module: 'rfq',
      entityId: id,
      oldValue: { status: rfq.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  /**
   * Side-by-side view of every submitted quotation with the cheapest price and
   * shortest lead time flagged for the buyer.
   */
  async compare(id: string, user: AuthUser) {
    if (user.supplierId) {
      throw new ForbiddenException('Suppliers cannot view the comparison');
    }

    const rfq = await this.prisma.rfq.findFirst({
      where: { id, deletedAt: null },
      include: RFQ_DETAIL_INCLUDE,
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const submitted = rfq.quotations.filter(
      (q) => q.status !== QuotationStatus.DRAFT,
    );

    const totals = submitted.map((q) => q.totalAmount);
    const lowestTotal = totals.length
      ? totals.reduce((min, t) => (t.lt(min) ? t : min))
      : null;

    const leadTimes = submitted
      .map((q) => q.leadTimeDays)
      .filter((d): d is number => d !== null);
    const shortestLeadTime = leadTimes.length ? Math.min(...leadTimes) : null;

    const rows = submitted.map((q) => {
      const isLowest = lowestTotal !== null && q.totalAmount.eq(lowestTotal);
      const diff =
        lowestTotal && lowestTotal.gt(0)
          ? q.totalAmount.sub(lowestTotal).div(lowestTotal).mul(100)
          : null;

      return {
        quotationId: q.id,
        code: q.code,
        supplier: {
          id: q.supplier.id,
          code: q.supplier.code,
          companyName: q.supplier.companyName,
          ratingAvg: q.supplier.ratingAvg,
        },
        status: q.status,
        currency: q.currency,
        totalAmount: q.totalAmount,
        isLowestPrice: isLowest,
        diffFromLowestPercent: diff ? Number(diff.toFixed(2)) : 0,
        leadTimeDays: q.leadTimeDays,
        isShortestLeadTime:
          shortestLeadTime !== null && q.leadTimeDays === shortestLeadTime,
        moq: q.moq,
        paymentTerm: q.paymentTerm,
        incoterm: q.incoterm,
        deliveryTerm: q.deliveryTerm,
        warranty: q.warranty,
        validUntil: q.validUntil,
        remark: q.remark,
        submittedAt: q.submittedAt,
        items: q.items,
        attachments: q.attachments.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          documentType: a.documentType,
          size: a.size,
        })),
      };
    });

    return {
      rfq: {
        id: rfq.id,
        code: rfq.code,
        title: rfq.title,
        status: rfq.status,
        dueDate: rfq.dueDate,
        awardedQuotationId: rfq.awardedQuotationId,
        purchaseRequest: {
          id: rfq.purchaseRequest.id,
          code: rfq.purchaseRequest.code,
          title: rfq.purchaseRequest.title,
          items: rfq.purchaseRequest.items,
        },
      },
      summary: {
        invited: rfq.suppliers.length,
        responded: submitted.length,
        lowestTotal,
        shortestLeadTime,
      },
      quotations: rows,
    };
  }

  async award(id: string, dto: AwardRfqDto, user: AuthUser) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, deletedAt: null },
      include: { quotations: { where: { deletedAt: null } } },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status === RfqStatus.AWARDED) {
      throw new BadRequestException('This RFQ has already been awarded');
    }

    const winner = rfq.quotations.find((q) => q.id === dto.quotationId);
    if (!winner) {
      throw new BadRequestException(
        'The quotation does not belong to this RFQ',
      );
    }
    if (winner.status === QuotationStatus.DRAFT) {
      throw new BadRequestException('That quotation has not been submitted');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.supplierQuotation.updateMany({
        where: { rfqId: id, id: { not: winner.id } },
        data: { status: QuotationStatus.REJECTED },
      });
      await tx.supplierQuotation.update({
        where: { id: winner.id },
        data: { status: QuotationStatus.AWARDED },
      });

      return tx.rfq.update({
        where: { id },
        data: {
          status: RfqStatus.AWARDED,
          awardedAt: new Date(),
          awardedQuotationId: winner.id,
          closedAt: rfq.closedAt ?? new Date(),
        },
        include: RFQ_DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'AWARD',
      module: 'rfq',
      entityId: id,
      oldValue: { status: rfq.status },
      newValue: {
        status: updated.status,
        quotationId: winner.id,
        supplierId: winner.supplierId,
        note: dto.note,
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Supplier side
  // -------------------------------------------------------------------------

  async markViewed(rfqId: string, user: AuthUser) {
    const supplierId = this.requireSupplier(user);
    const invite = await this.prisma.rfqSupplier.findUnique({
      where: { rfqId_supplierId: { rfqId, supplierId } },
    });
    if (!invite)
      throw new ForbiddenException('You were not invited to this RFQ');

    if (invite.status === RfqSupplierStatus.INVITED) {
      await this.prisma.rfqSupplier.update({
        where: { id: invite.id },
        data: { status: RfqSupplierStatus.VIEWED, viewedAt: new Date() },
      });
    }
    return { success: true };
  }

  async submitQuotation(
    rfqId: string,
    dto: SubmitQuotationDto,
    user: AuthUser,
  ) {
    const supplierId = this.requireSupplier(user);

    const rfq = await this.prisma.rfq.findFirst({
      where: { id: rfqId, deletedAt: null },
      include: { suppliers: true },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (!rfq.suppliers.some((s) => s.supplierId === supplierId)) {
      throw new ForbiddenException('You were not invited to this RFQ');
    }
    if (rfq.status !== RfqStatus.SENT) {
      throw new BadRequestException('This RFQ is not open for quotations');
    }
    if (rfq.dueDate && rfq.dueDate < new Date()) {
      throw new BadRequestException('The deadline for this RFQ has passed');
    }

    const existing = await this.prisma.supplierQuotation.findUnique({
      where: { rfqId_supplierId: { rfqId, supplierId } },
    });
    if (existing && existing.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException('You have already submitted a quotation');
    }

    const items = dto.items.map((item, index) => ({
      purchaseRequestItemId: item.purchaseRequestItemId,
      lineNo: item.lineNo ?? index + 1,
      name: item.name,
      description: item.description,
      quantity: new Prisma.Decimal(item.quantity),
      unit: item.unit,
      unitPrice: new Prisma.Decimal(item.unitPrice),
      lineTotal: new Prisma.Decimal(item.unitPrice).mul(item.quantity),
    }));
    const totalAmount = items.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );

    const code = existing?.code ?? (await this.codes.next('QT'));

    const quotation = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.quotationItem.deleteMany({
          where: { quotationId: existing.id },
        });
      }

      const data = {
        status: QuotationStatus.SUBMITTED,
        currency: dto.currency ?? 'VND',
        totalAmount,
        moq: dto.moq,
        leadTimeDays: dto.leadTimeDays,
        paymentTerm: dto.paymentTerm,
        incoterm: dto.incoterm,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        warranty: dto.warranty,
        deliveryTerm: dto.deliveryTerm,
        remark: dto.remark,
        submittedAt: new Date(),
        items: { create: items },
      };

      const saved = existing
        ? await tx.supplierQuotation.update({
            where: { id: existing.id },
            data,
            include: { items: true, supplier: true },
          })
        : await tx.supplierQuotation.create({
            data: { ...data, code, rfqId, supplierId },
            include: { items: true, supplier: true },
          });

      await tx.rfqSupplier.update({
        where: { rfqId_supplierId: { rfqId, supplierId } },
        data: { status: RfqSupplierStatus.QUOTED },
      });

      return saved;
    });

    await this.notifications.notify({
      userIds: [rfq.buyerId],
      event: NotificationEvent.QUOTATION_SUBMITTED,
      title: `Báo giá mới cho ${rfq.code}`,
      body: `${quotation.supplier.companyName} đã gửi báo giá ${quotation.totalAmount.toString()} ${quotation.currency}.`,
      link: `/rfqs/${rfq.id}/compare`,
      entityType: EntityType.QUOTATION,
      entityId: quotation.id,
    });

    await this.audit.record({
      userId: user.id,
      action: 'SUBMIT',
      module: 'quotation',
      entityId: quotation.id,
      newValue: {
        rfqId,
        supplierId,
        totalAmount: quotation.totalAmount.toString(),
      },
    });

    return quotation;
  }

  async myQuotations(user: AuthUser, dto: QueryRfqDto) {
    const supplierId = this.requireSupplier(user);
    const where: Prisma.SupplierQuotationWhereInput = {
      supplierId,
      deletedAt: null,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierQuotation.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          rfq: { select: { id: true, code: true, title: true, status: true } },
          items: { orderBy: { lineNo: 'asc' } },
        },
      }),
      this.prisma.supplierQuotation.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  private requireSupplier(user: AuthUser): string {
    if (!user.supplierId) {
      throw new ForbiddenException('This account is not linked to a supplier');
    }
    return user.supplierId;
  }

  private async requireDraft(id: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, deletedAt: null },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status !== RfqStatus.DRAFT) {
      throw new BadRequestException('Only a draft RFQ can be edited');
    }
    return rfq;
  }

  private async assertSuppliersInvitable(supplierIds: string[]) {
    const approved = await this.prisma.supplier.count({
      where: {
        id: { in: supplierIds },
        status: SupplierStatus.APPROVED,
        deletedAt: null,
      },
    });
    if (approved !== supplierIds.length) {
      throw new BadRequestException(
        'All invited suppliers must exist and be approved',
      );
    }
  }
}
