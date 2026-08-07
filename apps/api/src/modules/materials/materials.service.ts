import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MaterialChangeStatus,
  MaterialChangeType,
  MaterialStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { paginate } from '../../common/dto/pagination.dto';
import { countByStatus } from '../../common/status-counts';
import { PERMISSIONS } from '../../common/permissions';
import type { AuthUser } from '../../common/decorators';
import {
  CreateMaterialDto,
  QueryChangeRequestDto,
  QueryMaterialDto,
  RemoveMaterialDto,
  ReviewChangeDto,
  UpdateMaterialDto,
} from './dto/material.dto';

/** Các trường thuộc về bản thân mã, tách khỏi `reason` của đề xuất. */
const EDITABLE_FIELDS = [
  'name',
  'nameEn',
  'description',
  'specification',
  'unit',
  'categoryId',
  'manufacturer',
  'brand',
  'model',
  'hsCode',
  'standardPrice',
  'currency',
  'minStock',
] as const;

const LIST_INCLUDE = {
  category: { select: { id: true, name: true, nameEn: true } },
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.MaterialInclude;

const CHANGE_INCLUDE = {
  material: { select: { id: true, code: true, name: true, status: true } },
  requestedBy: { select: { id: true, fullName: true, email: true } },
  reviewedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.MaterialChangeRequestInclude;

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly codes: CodeGeneratorService,
  ) {}

  // -------------------------------------------------------------------------
  // Danh mục
  // -------------------------------------------------------------------------

  /** Điều kiện lọc dùng chung cho danh sách và cho phần đếm theo trạng thái. */
  private listWhere(
    dto: QueryMaterialDto,
    user: AuthUser,
    opts: { ignoreStatus?: boolean } = {},
  ): Prisma.MaterialWhereInput {
    const where: Prisma.MaterialWhereInput = {
      deletedAt: null,
      ...(dto.status && !opts.ignoreStatus ? { status: dto.status } : {}),
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      ...(dto.activeOnly ? { status: MaterialStatus.ACTIVE } : {}),
      ...(dto.search
        ? {
            OR: [
              { code: { contains: dto.search, mode: 'insensitive' } },
              { name: { contains: dto.search, mode: 'insensitive' } },
              { nameEn: { contains: dto.search, mode: 'insensitive' } },
              { specification: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Nhà cung cấp chỉ tra cứu mã đang dùng được, không thấy mã đang chờ duyệt.
    if (user.supplierId) where.status = MaterialStatus.ACTIVE;

    return where;
  }

  /** Số mã vật tư theo từng trạng thái. */
  async statusCounts(dto: QueryMaterialDto, user: AuthUser) {
    return countByStatus(
      this.prisma.material,
      this.listWhere(dto, user, { ignoreStatus: true }),
      MaterialStatus,
    );
  }

  async findAll(dto: QueryMaterialDto, user: AuthUser) {
    const where = this.listWhere(dto, user);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.material.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        // Danh mục tra cứu theo mã, nên mặc định xếp A→Z thay vì mới nhất trước.
        orderBy:
          dto.sortBy === 'createdAt'
            ? { code: 'asc' }
            : { [dto.sortBy]: dto.sortOrder },
        include: LIST_INCLUDE,
      }),
      this.prisma.material.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string, user: AuthUser) {
    const material = await this.prisma.material.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...LIST_INCLUDE,
        changeRequests: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: CHANGE_INCLUDE,
        },
      },
    });
    if (!material) throw new NotFoundException('Không tìm thấy mã vật tư');
    if (user.supplierId && material.status !== MaterialStatus.ACTIVE) {
      throw new ForbiddenException('Mã này chưa được ban hành');
    }
    return material;
  }

  /**
   * Lịch sử đặt hàng của một mã: đơn hàng đã phát hành, giá từng mua và mức
   * biến động, kèm nhu cầu đã ghi nhận qua các yêu cầu mua hàng.
   */
  async orderHistory(id: string, user: AuthUser) {
    // Lịch sử giá gồm giá của mọi nhà cung cấp từng bán mã này, là dữ liệu
    // thương mại nhạy cảm. Nhà cung cấp chỉ tra cứu được thông tin mã, không
    // được biết đối thủ chào bao nhiêu.
    if (user.supplierId) {
      throw new ForbiddenException(
        'Bạn không xem được lịch sử giá của bên mua',
      );
    }
    const material = await this.findOne(id, user);

    const [orderLines, requestLines] = await this.prisma.$transaction([
      this.prisma.purchaseOrderItem.findMany({
        where: {
          materialId: id,
          purchaseOrder: { deletedAt: null, status: { not: 'CANCELLED' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          purchaseOrder: {
            select: {
              id: true,
              code: true,
              status: true,
              currency: true,
              issuedAt: true,
              createdAt: true,
              supplier: { select: { id: true, code: true, companyName: true } },
            },
          },
        },
      }),
      this.prisma.purchaseRequestItem.findMany({
        where: { materialId: id, purchaseRequest: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          purchaseRequest: {
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              createdAt: true,
              requester: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
    ]);

    const prices = orderLines.map((l) => Number(l.unitPrice));
    const totalQty = orderLines.reduce((sum, l) => sum + Number(l.quantity), 0);
    const totalValue = orderLines.reduce(
      (sum, l) => sum + Number(l.lineTotal),
      0,
    );

    // Giá bình quân gia quyền theo sản lượng phản ánh chi phí thật hơn giá
    // bình quân số học, vì các đơn hàng có khối lượng rất khác nhau.
    const weightedAverage = totalQty > 0 ? totalValue / totalQty : null;

    const bySupplier = new Map<
      string,
      {
        supplier: { id: string; code: string; companyName: string };
        orders: number;
        quantity: number;
        value: number;
        lastPrice: number;
        lastOrderedAt: Date;
      }
    >();
    for (const line of orderLines) {
      const s = line.purchaseOrder.supplier;
      const entry = bySupplier.get(s.id);
      const at = line.purchaseOrder.issuedAt ?? line.purchaseOrder.createdAt;
      if (entry) {
        entry.orders += 1;
        entry.quantity += Number(line.quantity);
        entry.value += Number(line.lineTotal);
        if (at > entry.lastOrderedAt) {
          entry.lastOrderedAt = at;
          entry.lastPrice = Number(line.unitPrice);
        }
      } else {
        bySupplier.set(s.id, {
          supplier: s,
          orders: 1,
          quantity: Number(line.quantity),
          value: Number(line.lineTotal),
          lastPrice: Number(line.unitPrice),
          lastOrderedAt: at,
        });
      }
    }

    return {
      material: {
        id: material.id,
        code: material.code,
        name: material.name,
        unit: material.unit,
        standardPrice: material.standardPrice,
        currency: material.currency,
      },
      summary: {
        orders: orderLines.length,
        totalQuantity: Number(totalQty.toFixed(3)),
        totalValue: Number(totalValue.toFixed(2)),
        averagePrice:
          weightedAverage === null ? null : Number(weightedAverage.toFixed(2)),
        lowestPrice: prices.length ? Math.min(...prices) : null,
        highestPrice: prices.length ? Math.max(...prices) : null,
        lastOrderedAt: orderLines[0]
          ? (orderLines[0].purchaseOrder.issuedAt ??
            orderLines[0].purchaseOrder.createdAt)
          : null,
        suppliers: bySupplier.size,
      },
      orders: orderLines.map((l) => ({
        id: l.id,
        purchaseOrder: l.purchaseOrder,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        receivedQty: l.receivedQty,
        orderedAt: l.purchaseOrder.issuedAt ?? l.purchaseOrder.createdAt,
      })),
      bySupplier: [...bySupplier.values()].sort((a, b) => b.value - a.value),
      requests: requestLines.map((l) => ({
        id: l.id,
        purchaseRequest: l.purchaseRequest,
        quantity: l.quantity,
        unit: l.unit,
        estimatedPrice: l.estimatedPrice,
      })),
    };
  }

  /**
   * Tóm tắt giá của nhiều mã cùng lúc, để màn hình duyệt yêu cầu và màn hình
   * tạo đơn hàng hiển thị ngay giá thấp nhất và lần mua gần nhất mà không phải
   * gọi lần lượt từng mã.
   */
  async priceSummary(ids: string[], user: AuthUser) {
    if (user.supplierId) {
      throw new ForbiddenException(
        'Bạn không xem được lịch sử giá của bên mua',
      );
    }
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return {};

    const [aggregates, latest] = await Promise.all([
      this.prisma.purchaseOrderItem.groupBy({
        by: ['materialId'],
        where: {
          materialId: { in: unique },
          purchaseOrder: { deletedAt: null, status: { not: 'CANCELLED' } },
        },
        _count: { _all: true },
        _min: { unitPrice: true },
        _max: { unitPrice: true },
        _sum: { quantity: true, lineTotal: true },
      }),
      // DISTINCT ON lấy đúng dòng mới nhất của mỗi mã trong một lượt quét.
      this.prisma.$queryRaw<
        {
          materialId: string;
          unitPrice: string;
          orderedAt: Date;
          code: string;
          purchaseOrderId: string;
          companyName: string;
        }[]
      >`
        SELECT DISTINCT ON (i."materialId")
          i."materialId",
          i."unitPrice"::text AS "unitPrice",
          COALESCE(o."issuedAt", o."createdAt") AS "orderedAt",
          o."code",
          o."id" AS "purchaseOrderId",
          s."companyName"
        FROM purchase_order_items i
        JOIN purchase_orders o ON o.id = i."purchaseOrderId"
        JOIN suppliers s ON s.id = o."supplierId"
        WHERE i."materialId" = ANY(${unique}::text[])
          AND o."deletedAt" IS NULL
          AND o."status" <> 'CANCELLED'
        ORDER BY i."materialId", COALESCE(o."issuedAt", o."createdAt") DESC
      `,
    ]);

    const latestById = new Map(latest.map((row) => [row.materialId, row]));

    const result: Record<string, unknown> = {};
    for (const row of aggregates) {
      if (!row.materialId) continue;
      const qty = Number(row._sum.quantity ?? 0);
      const value = Number(row._sum.lineTotal ?? 0);
      const last = latestById.get(row.materialId);
      result[row.materialId] = {
        orders: row._count._all,
        lowestPrice:
          row._min.unitPrice === null ? null : Number(row._min.unitPrice),
        highestPrice:
          row._max.unitPrice === null ? null : Number(row._max.unitPrice),
        averagePrice: qty > 0 ? Number((value / qty).toFixed(2)) : null,
        lastPrice: last ? Number(last.unitPrice) : null,
        lastOrderedAt: last?.orderedAt ?? null,
        lastSupplier: last?.companyName ?? null,
        lastPurchaseOrder: last
          ? { id: last.purchaseOrderId, code: last.code }
          : null,
      };
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Đề xuất thay đổi
  // -------------------------------------------------------------------------

  /**
   * Người dùng đề xuất mã mới. Nếu người đề xuất đã có quyền duyệt thì áp dụng
   * ngay, nhưng vẫn ghi lại một bản đề xuất đã duyệt để lịch sử liền mạch.
   */
  async requestCreate(dto: CreateMaterialDto, user: AuthUser) {
    const { reason, ...fields } = dto;
    const code = fields.code ?? (await this.codes.next('MAT'));
    await this.assertCodeFree(code);

    if (fields.categoryId) await this.assertCategoryExists(fields.categoryId);

    const material = await this.prisma.material.create({
      data: {
        ...(this.materialData(fields) as Prisma.MaterialUncheckedCreateInput),
        name: fields.name,
        unit: fields.unit,
        code,
        status: MaterialStatus.PENDING,
        createdById: user.id,
      },
    });

    const request = await this.prisma.materialChangeRequest.create({
      data: {
        materialId: material.id,
        type: MaterialChangeType.CREATE,
        payload: {
          ...this.materialData(fields),
          code,
        },
        reason,
        requestedById: user.id,
      },
      include: CHANGE_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'REQUEST_CREATE',
      module: 'material',
      entityId: material.id,
      newValue: { code, name: material.name },
    });

    return this.autoApprove(request.id, user, 'Người đề xuất có quyền duyệt');
  }

  async requestUpdate(id: string, dto: UpdateMaterialDto, user: AuthUser) {
    const { reason, ...fields } = dto;
    const material = await this.mustFind(id);

    const payload = this.materialData(fields);
    if (!Object.keys(payload).length) {
      throw new BadRequestException('Chưa có thay đổi nào để đề xuất');
    }
    if (payload.categoryId)
      await this.assertCategoryExists(payload.categoryId as string);

    await this.assertNoPendingChange(id);

    const request = await this.prisma.materialChangeRequest.create({
      data: {
        materialId: id,
        type: MaterialChangeType.UPDATE,
        payload: payload as Prisma.InputJsonValue,
        snapshot: this.snapshot(material) as Prisma.InputJsonValue,
        reason,
        requestedById: user.id,
      },
      include: CHANGE_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'REQUEST_UPDATE',
      module: 'material',
      entityId: id,
      oldValue: this.snapshot(material),
      newValue: payload,
    });

    return this.autoApprove(request.id, user, 'Người đề xuất có quyền duyệt');
  }

  async requestRemove(id: string, dto: RemoveMaterialDto, user: AuthUser) {
    const material = await this.mustFind(id);
    if (material.status === MaterialStatus.INACTIVE) {
      throw new BadRequestException('Mã này đã ngừng dùng');
    }
    await this.assertNoPendingChange(id);

    const request = await this.prisma.materialChangeRequest.create({
      data: {
        materialId: id,
        type: MaterialChangeType.DELETE,
        snapshot: this.snapshot(material) as Prisma.InputJsonValue,
        reason: dto.reason,
        requestedById: user.id,
      },
      include: CHANGE_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'REQUEST_DELETE',
      module: 'material',
      entityId: id,
      oldValue: { code: material.code, name: material.name },
    });

    return this.autoApprove(request.id, user, 'Người đề xuất có quyền duyệt');
  }

  /**
   * Đưa một mã đã ngừng dùng trở lại. Payload do server dựng nên người dùng
   * không tự đặt được trạng thái qua đường sửa thông thường.
   */
  async requestRestore(id: string, dto: RemoveMaterialDto, user: AuthUser) {
    const material = await this.mustFind(id);
    if (material.status === MaterialStatus.ACTIVE) {
      throw new BadRequestException('Mã này đang dùng được');
    }
    await this.assertNoPendingChange(id);

    const request = await this.prisma.materialChangeRequest.create({
      data: {
        materialId: id,
        type: MaterialChangeType.UPDATE,
        payload: {
          status: MaterialStatus.ACTIVE,
          isActive: true,
        },
        snapshot: { status: material.status },
        reason: dto.reason ?? 'Khôi phục mã đã ngừng dùng',
        requestedById: user.id,
      },
      include: CHANGE_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'REQUEST_RESTORE',
      module: 'material',
      entityId: id,
      newValue: { code: material.code },
    });

    return this.autoApprove(request.id, user, 'Người đề xuất có quyền duyệt');
  }

  /** Điều kiện lọc dùng chung cho danh sách và cho phần đếm theo trạng thái. */
  private changeRequestWhere(
    dto: QueryChangeRequestDto,
    user: AuthUser,
    opts: { ignoreStatus?: boolean } = {},
  ): Prisma.MaterialChangeRequestWhereInput {
    const canApprove = user.permissions.includes(PERMISSIONS.MATERIAL_APPROVE);
    return {
      ...(dto.status && !opts.ignoreStatus ? { status: dto.status } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      // Ai không duyệt được thì chỉ thấy đề xuất của chính mình.
      ...(dto.mine || !canApprove ? { requestedById: user.id } : {}),
    };
  }

  /** Số đề xuất thay đổi mã theo từng trạng thái. */
  async changeRequestStatusCounts(dto: QueryChangeRequestDto, user: AuthUser) {
    return countByStatus(
      this.prisma.materialChangeRequest,
      this.changeRequestWhere(dto, user, { ignoreStatus: true }),
      MaterialChangeStatus,
    );
  }

  async changeRequests(dto: QueryChangeRequestDto, user: AuthUser) {
    const where = this.changeRequestWhere(dto, user);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.materialChangeRequest.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { createdAt: dto.sortOrder },
        include: CHANGE_INCLUDE,
      }),
      this.prisma.materialChangeRequest.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  // -------------------------------------------------------------------------
  // Duyệt
  // -------------------------------------------------------------------------

  async approve(requestId: string, dto: ReviewChangeDto, user: AuthUser) {
    return this.applyDecision(
      requestId,
      user,
      MaterialChangeStatus.APPROVED,
      dto.note,
    );
  }

  async reject(requestId: string, dto: ReviewChangeDto, user: AuthUser) {
    if (!dto.note) {
      throw new BadRequestException('Cần nêu lý do khi từ chối');
    }
    return this.applyDecision(
      requestId,
      user,
      MaterialChangeStatus.REJECTED,
      dto.note,
    );
  }

  /** Người đề xuất rút lại đề xuất của mình khi chưa ai duyệt. */
  async cancel(requestId: string, user: AuthUser) {
    const request = await this.mustFindRequest(requestId);
    if (request.requestedById !== user.id) {
      throw new ForbiddenException('Chỉ người đề xuất mới rút lại được');
    }
    if (request.status !== MaterialChangeStatus.PENDING) {
      throw new BadRequestException('Đề xuất này đã được xử lý');
    }
    return this.applyDecision(
      requestId,
      user,
      MaterialChangeStatus.CANCELLED,
      'Người đề xuất rút lại',
    );
  }

  private async applyDecision(
    requestId: string,
    user: AuthUser,
    decision: MaterialChangeStatus,
    note?: string,
  ) {
    const request = await this.mustFindRequest(requestId);
    if (request.status !== MaterialChangeStatus.PENDING) {
      throw new BadRequestException('Đề xuất này đã được xử lý');
    }

    const applied = decision === MaterialChangeStatus.APPROVED;

    await this.prisma.$transaction(async (tx) => {
      await tx.materialChangeRequest.update({
        where: { id: requestId },
        data: {
          status: decision,
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });

      if (!request.materialId) return;

      if (applied) {
        switch (request.type) {
          case MaterialChangeType.CREATE:
            await tx.material.update({
              where: { id: request.materialId },
              data: {
                status: MaterialStatus.ACTIVE,
                approvedById: user.id,
                approvedAt: new Date(),
              },
            });
            break;
          case MaterialChangeType.UPDATE:
            await tx.material.update({
              where: { id: request.materialId },
              data: (request.payload ?? {}) as Prisma.MaterialUpdateInput,
            });
            break;
          case MaterialChangeType.DELETE:
            // Ngừng dùng thay vì xoá hẳn: mã vẫn phải tra cứu được từ đơn cũ.
            await tx.material.update({
              where: { id: request.materialId },
              data: {
                status: MaterialStatus.INACTIVE,
                isActive: false,
                deletedAt: (await this.isCodeUnused(request.materialId, tx))
                  ? new Date()
                  : null,
              },
            });
            break;
        }
      } else if (request.type === MaterialChangeType.CREATE) {
        // Mã mới bị từ chối thì không để lại rác trong danh mục.
        await tx.material.update({
          where: { id: request.materialId },
          data: { deletedAt: new Date(), isActive: false },
        });
      }
    });

    await this.audit.record({
      userId: user.id,
      action: decision,
      module: 'material_change_request',
      entityId: requestId,
      newValue: { type: request.type, materialId: request.materialId, note },
    });

    return this.prisma.materialChangeRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: CHANGE_INCLUDE,
    });
  }

  /**
   * Đề xuất do chính người có quyền duyệt tạo ra thì áp dụng luôn — vẫn đi qua
   * cùng một đường nên lịch sử ghi nhận đầy đủ ai làm, lúc nào.
   */
  private async autoApprove(requestId: string, user: AuthUser, note: string) {
    if (!user.permissions.includes(PERMISSIONS.MATERIAL_APPROVE)) {
      return this.prisma.materialChangeRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: CHANGE_INCLUDE,
      });
    }
    return this.applyDecision(
      requestId,
      user,
      MaterialChangeStatus.APPROVED,
      note,
    );
  }

  // -------------------------------------------------------------------------
  // Trợ giúp
  // -------------------------------------------------------------------------

  private materialData(fields: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (fields[key] !== undefined) data[key] = fields[key];
    }
    return data;
  }

  private snapshot(material: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      const value = material[key];
      // Decimal và Date phải thành chuỗi mới lưu được vào cột Json.
      data[key] =
        value === null || value === undefined || typeof value !== 'object'
          ? value
          : (value as { toString(): string }).toString();
    }
    return data;
  }

  private async mustFind(id: string) {
    const material = await this.prisma.material.findFirst({
      where: { id, deletedAt: null },
    });
    if (!material) throw new NotFoundException('Không tìm thấy mã vật tư');
    return material;
  }

  private async mustFindRequest(id: string) {
    const request = await this.prisma.materialChangeRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Không tìm thấy đề xuất');
    return request;
  }

  private async assertCodeFree(code: string) {
    const existing = await this.prisma.material.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Mã ${code} đã tồn tại trong danh mục`);
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!category) throw new BadRequestException('Lĩnh vực không tồn tại');
  }

  /** Một mã chỉ nên có một đề xuất đang chờ, tránh hai người sửa chồng nhau. */
  private async assertNoPendingChange(materialId: string) {
    const pending = await this.prisma.materialChangeRequest.findFirst({
      where: { materialId, status: MaterialChangeStatus.PENDING },
      include: { requestedBy: { select: { fullName: true } } },
    });
    if (pending) {
      throw new BadRequestException(
        `Mã này đang có đề xuất chờ duyệt của ${pending.requestedBy.fullName}`,
      );
    }
  }

  /** Mã chưa từng xuất hiện ở đâu thì xoá hẳn được, ngược lại chỉ ngừng dùng. */
  private async isCodeUnused(
    materialId: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const [po, pr, quote] = await Promise.all([
      tx.purchaseOrderItem.count({ where: { materialId } }),
      tx.purchaseRequestItem.count({ where: { materialId } }),
      tx.quotationItem.count({ where: { materialId } }),
    ]);
    return po + pr + quote === 0;
  }
}
