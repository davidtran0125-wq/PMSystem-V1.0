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
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';
import { paginate } from '../../common/dto/pagination.dto';
import { countByStatus } from '../../common/status-counts';
import {
  QuerySupplierDto,
  SupplierDecisionDto,
  UpdateSupplierProfileDto,
} from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Điều kiện lọc dùng chung cho danh sách và cho phần đếm theo trạng thái. */
  private listWhere(
    dto: QuerySupplierDto,
    opts: { ignoreStatus?: boolean } = {},
  ): Prisma.SupplierWhereInput {
    return {
      deletedAt: null,
      ...(dto.status && !opts.ignoreStatus ? { status: dto.status } : {}),
      ...(dto.categoryId
        ? { categories: { some: { categoryId: dto.categoryId } } }
        : {}),
      ...(dto.search
        ? {
            OR: [
              { companyName: { contains: dto.search, mode: 'insensitive' } },
              { code: { contains: dto.search, mode: 'insensitive' } },
              { taxCode: { contains: dto.search, mode: 'insensitive' } },
              { email: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Số nhà cung cấp theo từng trạng thái. */
  async statusCounts(dto: QuerySupplierDto) {
    return countByStatus(
      this.prisma.supplier,
      this.listWhere(dto, { ignoreStatus: true }),
      SupplierStatus,
    );
  }

  async findAll(dto: QuerySupplierDto) {
    const where = this.listWhere(dto);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { [dto.sortBy]: dto.sortOrder },
        include: {
          categories: { include: { category: true } },
          _count: { select: { quotations: true, contracts: true } },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string, user: AuthUser) {
    // A supplier user may only ever read its own company record.
    if (user.supplierId && user.supplierId !== id) {
      throw new ForbiddenException('You cannot access this supplier');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        categories: { include: { category: true } },
        certificates: { where: { deletedAt: null } },
        attachments: { where: { deletedAt: null } },
        _count: { select: { quotations: true, contracts: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async myProfile(user: AuthUser) {
    if (!user.supplierId) {
      throw new ForbiddenException('This account is not linked to a supplier');
    }
    return this.findOne(user.supplierId, user);
  }

  async update(id: string, dto: UpdateSupplierProfileDto, user: AuthUser) {
    if (user.supplierId && user.supplierId !== id) {
      throw new ForbiddenException('You cannot edit this supplier');
    }
    if (
      !user.supplierId &&
      !user.permissions.includes(PERMISSIONS.SUPPLIER_WRITE)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const current = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Supplier not found');

    const { categoryIds, ...profile } = dto;

    const supplier = await this.prisma.$transaction(async (tx) => {
      if (categoryIds) {
        const found = await tx.category.count({
          where: { id: { in: categoryIds }, deletedAt: null },
        });
        if (found !== categoryIds.length) {
          throw new BadRequestException('One or more categories do not exist');
        }
        await tx.supplierCategory.deleteMany({ where: { supplierId: id } });
        await tx.supplierCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            supplierId: id,
            categoryId,
          })),
        });
      }

      return tx.supplier.update({
        where: { id },
        data: profile,
        include: { categories: { include: { category: true } } },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      module: 'supplier',
      entityId: id,
      oldValue: { companyName: current.companyName, status: current.status },
      newValue: { companyName: supplier.companyName },
    });

    return supplier;
  }

  async approve(id: string, user: AuthUser) {
    const current = await this.requirePending(id);

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        status: SupplierStatus.APPROVED,
        approvedAt: new Date(),
        rejectReason: null,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'APPROVE',
      module: 'supplier',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: supplier.status },
    });

    await this.notifySupplierUsers(
      id,
      NotificationEvent.SUPPLIER_APPROVED,
      'Hồ sơ nhà cung cấp đã được duyệt',
      'Bạn đã có thể nhận và gửi báo giá cho các RFQ.',
    );

    return supplier;
  }

  async reject(id: string, dto: SupplierDecisionDto, user: AuthUser) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required when rejecting');
    }
    const current = await this.requirePending(id);

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { status: SupplierStatus.REJECTED, rejectReason: dto.reason },
    });

    await this.audit.record({
      userId: user.id,
      action: 'REJECT',
      module: 'supplier',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: supplier.status, reason: dto.reason },
    });

    await this.notifySupplierUsers(
      id,
      NotificationEvent.SUPPLIER_REJECTED,
      'Hồ sơ nhà cung cấp bị từ chối',
      dto.reason,
    );

    return supplier;
  }

  private async requirePending(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.status === SupplierStatus.APPROVED) {
      throw new BadRequestException('Supplier is already approved');
    }
    return supplier;
  }

  private async notifySupplierUsers(
    supplierId: string,
    event: NotificationEvent,
    title: string,
    body: string,
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
      link: '/supplier/profile',
      entityType: EntityType.SUPPLIER,
      entityId: supplierId,
    });
  }
}
