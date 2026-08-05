import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  UpsertDynamicFormDto,
} from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(dto: PaginationDto, activeOnly = false) {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(activeOnly ? { isActive: true } : {}),
      ...(dto.search
        ? {
            OR: [
              { name: { contains: dto.search, mode: 'insensitive' } },
              { nameEn: { contains: dto.search, mode: 'insensitive' } },
              { code: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { purchaseRequests: true, supplierCategories: true },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { parent: true, children: { where: { deletedAt: null } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** The active form drives the dynamic section of the purchase request form. */
  async activeForm(categoryId: string) {
    const form = await this.prisma.dynamicForm.findFirst({
      where: { categoryId, isActive: true, deletedAt: null },
      orderBy: { version: 'desc' },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return form ?? { id: null, categoryId, name: null, version: 0, fields: [] };
  }

  async create(dto: CreateCategoryDto, userId: string) {
    const existing = await this.prisma.category.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Category code already exists');

    const category = await this.prisma.category.create({ data: dto });
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'category',
      entityId: category.id,
      newValue: category,
    });
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const current = await this.findOne(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'category',
      entityId: id,
      oldValue: current,
      newValue: category,
    });
    return category;
  }

  async remove(id: string, userId: string) {
    const current = await this.findOne(id);
    const inUse = await this.prisma.purchaseRequest.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new ConflictException(
        'Category is used by purchase requests and cannot be deleted',
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      userId,
      action: 'DELETE',
      module: 'category',
      entityId: id,
      oldValue: current,
    });
    return { success: true };
  }

  /**
   * Publishes a new version of the category form rather than mutating the
   * current one, so historical purchase requests keep the labels they were
   * captured with.
   */
  async upsertForm(
    categoryId: string,
    dto: UpsertDynamicFormDto,
    userId: string,
  ) {
    await this.findOne(categoryId);

    const keys = dto.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      throw new ConflictException('Field keys must be unique within a form');
    }

    const latest = await this.prisma.dynamicForm.findFirst({
      where: { categoryId },
      orderBy: { version: 'desc' },
    });

    const form = await this.prisma.$transaction(async (tx) => {
      await tx.dynamicForm.updateMany({
        where: { categoryId },
        data: { isActive: false },
      });

      return tx.dynamicForm.create({
        data: {
          categoryId,
          name: dto.name,
          version: (latest?.version ?? 0) + 1,
          isActive: true,
          fields: {
            create: dto.fields.map((field, index) => ({
              key: field.key,
              label: field.label,
              labelEn: field.labelEn,
              type: field.type,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired ?? false,
              sortOrder: field.sortOrder ?? index,
              options: field.options
                ? (field.options as unknown as Prisma.InputJsonValue)
                : undefined,
              defaultValue: field.defaultValue,
            })),
          },
        },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'dynamic_form',
      entityId: form.id,
      newValue: {
        categoryId,
        version: form.version,
        fields: dto.fields.length,
      },
    });

    return form;
  }
}
