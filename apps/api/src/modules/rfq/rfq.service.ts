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
import { countByStatus } from '../../common/status-counts';
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

  /**
   * Điều kiện lọc dùng chung cho danh sách và cho phần đếm theo trạng thái, để
   * hai con số không lệch nhau.
   */
  private listWhere(
    dto: QueryRfqDto,
    user: AuthUser,
    opts: { ignoreStatus?: boolean } = {},
  ): Prisma.RfqWhereInput {
    const where: Prisma.RfqWhereInput = {
      deletedAt: null,
      ...(dto.status && !opts.ignoreStatus ? { status: dto.status } : {}),
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
      if (!where.status) where.status = { not: RfqStatus.DRAFT };
    }

    return where;
  }

  /**
   * Số lượng RFQ theo từng trạng thái, tính trên bộ lọc hiện hành trừ chính bộ
   * lọc trạng thái — các con số giữ nguyên khi người dùng bấm qua lại.
   */
  async statusCounts(dto: QueryRfqDto, user: AuthUser) {
    return countByStatus(
      this.prisma.rfq,
      this.listWhere(dto, user, { ignoreStatus: true }),
      RfqStatus,
    );
  }

  async findAll(dto: QueryRfqDto, user: AuthUser) {
    const where = this.listWhere(dto, user);

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

      // Nhà cung cấp chỉ thấy phần của chính mình: không thấy báo giá của đối
      // thủ, cũng không thấy đối thủ là ai — danh sách được mời là thông tin
      // cạnh tranh, biết được là đoán ra mặt bằng giá.
      const mine = rfq.quotations.find((q) => q.supplierId === user.supplierId);
      return {
        ...rfq,
        suppliers: rfq.suppliers.filter(
          (s) => s.supplierId === user.supplierId,
        ),
        quotations: mine ? [mine] : [],
        // Chỉ đưa con số để nhà cung cấp biết mức độ cạnh tranh, không kèm tên.
        competitorCount: Math.max(0, rfq.suppliers.length - 1),
        // Kết quả thầu của riêng mình, không kèm giá của bên trúng.
        myResult:
          rfq.status !== RfqStatus.AWARDED
            ? null
            : mine?.status === QuotationStatus.AWARDED
              ? 'WON'
              : mine
                ? 'LOST'
                : 'NO_QUOTE',
      };
    }

    // Bên mua: che giá của mọi báo giá cho tới khi vòng chào giá khép lại.
    const seal = this.sealState(rfq);
    if (!seal.sealed) return { ...rfq, sealed: false };

    return {
      ...rfq,
      sealed: true,
      seal: {
        pendingSuppliers: seal.pending,
        message: `Giá còn được niêm phong. Còn ${seal.pending} nhà cung cấp chưa trả lời.`,
      },
      quotations: rfq.quotations.map((q) => ({
        ...q,
        totalAmount: null,
        moq: null,
        items: q.items.map((i) => ({
          ...i,
          unitPrice: null,
          lineTotal: null,
        })),
      })),
    };
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
  /**
   * Đấu thầu kín: không ai — kể cả người mua — xem được giá cho tới khi vòng
   * chào giá khép lại. Biết giá sớm là biết ai đang rẻ nhất, và chỉ cần một câu
   * gợi ý là cuộc thầu mất ý nghĩa.
   *
   * Niêm phong được mở khi xảy ra một trong ba điều, tuỳ điều nào đến trước:
   *   - người mua bấm đóng nhận báo giá,
   *   - quá hạn nộp,
   *   - mọi nhà cung cấp được mời đều đã trả lời (nộp giá hoặc từ chối).
   *
   * Điều kiện thứ ba tránh việc cả cuộc thầu bị treo vì một bên không hồi âm,
   * mà vẫn không cho phép nhìn trộm khi còn người chưa nộp.
   */
  private sealState(rfq: {
    status: RfqStatus;
    dueDate: Date | null;
    closedAt: Date | null;
    suppliers: { status: RfqSupplierStatus }[];
  }) {
    if (rfq.status === RfqStatus.CLOSED || rfq.status === RfqStatus.AWARDED) {
      return { sealed: false as const, reason: 'closed' as const };
    }
    if (rfq.dueDate && rfq.dueDate.getTime() <= Date.now()) {
      return { sealed: false as const, reason: 'due_date_passed' as const };
    }
    const pending = rfq.suppliers.filter(
      (s) =>
        s.status !== RfqSupplierStatus.QUOTED &&
        s.status !== RfqSupplierStatus.DECLINED,
    ).length;
    if (rfq.suppliers.length > 0 && pending === 0) {
      return { sealed: false as const, reason: 'all_responded' as const };
    }
    return { sealed: true as const, pending };
  }

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

    const seal = this.sealState(rfq);
    if (seal.sealed) {
      // Còn niêm phong thì chỉ cho biết ai đã nộp và nộp lúc nào — đủ để theo
      // dõi tiến độ mà không lộ con số nào.
      return {
        rfq: {
          id: rfq.id,
          code: rfq.code,
          title: rfq.title,
          status: rfq.status,
          dueDate: rfq.dueDate,
          awardedQuotationIds: [],
          purchaseRequest: rfq.purchaseRequest,
        },
        sealed: true,
        seal: {
          pendingSuppliers: seal.pending,
          message:
            `Giá còn được niêm phong. Còn ${seal.pending} nhà cung cấp chưa trả lời — ` +
            'đóng nhận báo giá hoặc chờ hết hạn nộp thì mới xem được giá.',
        },
        summary: {
          invited: rfq.suppliers.length,
          responded: submitted.length,
          lowestTotal: null,
          shortestLeadTime: null,
        },
        quotations: submitted.map((q) => ({
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
          submittedAt: q.submittedAt,
          itemCount: q.items.length,
          attachmentCount: q.attachments.length,
        })),
      };
    }

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
        isAwarded: q.status === QuotationStatus.AWARDED,
        awardedItemIds: q.items.filter((i) => i.isAwarded).map((i) => i.id),
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
      sealed: false,
      rfq: {
        id: rfq.id,
        code: rfq.code,
        title: rfq.title,
        status: rfq.status,
        dueDate: rfq.dueDate,
        awardedQuotationIds: submitted
          .filter((q) => q.status === QuotationStatus.AWARDED)
          .map((q) => q.id),
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

  /**
   * Awards the RFQ to one or more suppliers. A supplier can win the whole
   * quotation or only some of its lines, so a multi-item request can be split
   * across suppliers — cheapest chemical from one, fastest machine from another.
   */
  async award(id: string, dto: AwardRfqDto, user: AuthUser) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, deletedAt: null },
      include: {
        quotations: { where: { deletedAt: null }, include: { items: true } },
        // sealState cần biết ai đã trả lời, ai chưa.
        suppliers: { select: { status: true } },
      },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.status === RfqStatus.AWARDED) {
      throw new BadRequestException('RFQ này đã trao thầu rồi');
    }

    // Không thể chọn nhà cung cấp khi chính người trao còn chưa được xem giá.
    const seal = this.sealState(rfq);
    if (seal.sealed) {
      throw new BadRequestException(
        `Giá còn niêm phong, chưa trao thầu được. Còn ${seal.pending} nhà cung cấp ` +
          'chưa trả lời — hãy đóng nhận báo giá hoặc chờ hết hạn nộp.',
      );
    }
    if (!dto.awards.length) {
      throw new BadRequestException('Chọn ít nhất một báo giá để trao thầu');
    }

    const byId = new Map(rfq.quotations.map((q) => [q.id, q]));
    const winners = dto.awards.map((award) => {
      const quotation = byId.get(award.quotationId);
      if (!quotation) {
        throw new BadRequestException('Báo giá được chọn không thuộc RFQ này');
      }
      if (quotation.status === QuotationStatus.DRAFT) {
        throw new BadRequestException(
          `Báo giá ${quotation.code} chưa được gửi`,
        );
      }

      // Omitting itemIds awards the whole quotation.
      const itemIds = award.itemIds?.length
        ? award.itemIds
        : quotation.items.map((i) => i.id);

      const owned = new Set(quotation.items.map((i) => i.id));
      const foreign = itemIds.filter((itemId) => !owned.has(itemId));
      if (foreign.length) {
        throw new BadRequestException(
          `Dòng hàng được chọn không thuộc báo giá ${quotation.code}`,
        );
      }
      return { quotation, itemIds };
    });

    // The same requested line must not be awarded to two suppliers at once.
    const seen = new Map<string, string>();
    for (const { quotation, itemIds } of winners) {
      for (const itemId of itemIds) {
        const item = quotation.items.find((i) => i.id === itemId)!;
        const key = item.purchaseRequestItemId ?? `line:${item.lineNo}`;
        const other = seen.get(key);
        if (other && other !== quotation.id) {
          throw new BadRequestException(
            `Dòng hàng "${item.name}" đang được trao cho nhiều nhà cung cấp`,
          );
        }
        seen.set(key, quotation.id);
      }
    }

    const winnerIds = winners.map((w) => w.quotation.id);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.supplierQuotation.updateMany({
        where: { rfqId: id, id: { notIn: winnerIds } },
        data: { status: QuotationStatus.REJECTED },
      });

      for (const { quotation, itemIds } of winners) {
        await tx.supplierQuotation.update({
          where: { id: quotation.id },
          data: { status: QuotationStatus.AWARDED, awardedAt: now },
        });
        await tx.quotationItem.updateMany({
          where: { quotationId: quotation.id },
          data: { isAwarded: false },
        });
        await tx.quotationItem.updateMany({
          where: { id: { in: itemIds } },
          data: { isAwarded: true },
        });
      }

      return tx.rfq.update({
        where: { id },
        data: {
          status: RfqStatus.AWARDED,
          awardedAt: now,
          closedAt: rfq.closedAt ?? now,
        },
        include: RFQ_DETAIL_INCLUDE,
      });
    });

    await this.notifications.notify({
      userIds: await this.supplierUserIds(
        winnerIds.map((qid) => byId.get(qid)!.supplierId),
      ),
      event: NotificationEvent.QUOTATION_SUBMITTED,
      title: `Báo giá của bạn đã trúng thầu ${rfq.code}`,
      body: `Bên mua đã chọn báo giá của bạn cho "${rfq.title}". Đơn hàng sẽ được phát hành sau.`,
      link: '/supplier/quotations',
      entityType: EntityType.RFQ,
      entityId: rfq.id,
    });

    // Bên thua cũng cần biết để thôi chờ, nhưng tuyệt đối không kèm giá hay
    // tên bên trúng — đó là thông tin cạnh tranh của bên kia.
    const loserSupplierIds = rfq.quotations
      .filter(
        (q) => !winnerIds.includes(q.id) && q.status !== QuotationStatus.DRAFT,
      )
      .map((q) => q.supplierId);
    if (loserSupplierIds.length) {
      await this.notifications.notify({
        userIds: await this.supplierUserIds(loserSupplierIds),
        event: NotificationEvent.QUOTATION_SUBMITTED,
        title: `Kết quả ${rfq.code}: báo giá của bạn chưa được chọn`,
        body: `Bên mua đã chốt nhà cung cấp cho "${rfq.title}". Cảm ơn bạn đã tham gia báo giá.`,
        link: '/supplier/quotations',
        entityType: EntityType.RFQ,
        entityId: rfq.id,
      });
    }

    await this.audit.record({
      userId: user.id,
      action: 'AWARD',
      module: 'rfq',
      entityId: id,
      oldValue: { status: rfq.status },
      newValue: {
        status: updated.status,
        awards: winners.map((w) => ({
          quotationId: w.quotation.id,
          supplierId: w.quotation.supplierId,
          items: w.itemIds.length,
        })),
        note: dto.note,
      },
    });

    return updated;
  }

  private async supplierUserIds(supplierIds: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { supplierId: { in: supplierIds }, deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
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

    // Mã vật tư đi theo dòng hàng gốc của yêu cầu mua, để lịch sử đặt hàng của
    // mã vẫn liền mạch dù nhà cung cấp tự nhập lại tên hàng.
    const requestItems = await this.prisma.purchaseRequestItem.findMany({
      where: { purchaseRequestId: rfq.purchaseRequestId },
      select: { id: true, lineNo: true, materialId: true },
    });
    const materialByRequestItem = new Map(
      requestItems.map((i) => [i.id, i.materialId]),
    );
    const materialByLine = new Map(
      requestItems.map((i) => [i.lineNo, i.materialId]),
    );

    const items = dto.items.map((item, index) => ({
      purchaseRequestItemId: item.purchaseRequestItemId,
      materialId:
        (item.purchaseRequestItemId
          ? materialByRequestItem.get(item.purchaseRequestItemId)
          : materialByLine.get(item.lineNo ?? index + 1)) ?? null,
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

  /** Số báo giá của chính nhà cung cấp theo từng trạng thái. */
  async myQuotationStatusCounts(user: AuthUser) {
    const supplierId = this.requireSupplier(user);
    return countByStatus(
      this.prisma.supplierQuotation,
      { supplierId, deletedAt: null },
      QuotationStatus,
    );
  }

  async myQuotations(user: AuthUser, dto: QueryRfqDto) {
    const supplierId = this.requireSupplier(user);
    const where: Prisma.SupplierQuotationWhereInput = {
      supplierId,
      deletedAt: null,
      ...(dto.quotationStatus ? { status: dto.quotationStatus } : {}),
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
