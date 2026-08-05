import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { CreatePerformanceDto } from './dto/performance.dto';

/**
 * Weights add up to 1. Price and quality dominate because they drive the award
 * decision; the complaint rate is a penalty rather than a scored criterion.
 */
const WEIGHTS = {
  price: 0.25,
  quality: 0.3,
  delivery: 0.2,
  response: 0.1,
  cooperation: 0.15,
} as const;

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Weighted 1–5 score scaled to 100, minus the complaint rate. Clamped to
   * 0–100 so a heavy complaint rate cannot produce a negative score.
   */
  static computeTotal(dto: {
    priceScore: number;
    qualityScore: number;
    deliveryScore: number;
    responseScore: number;
    cooperationScore: number;
    complaintRate?: number;
  }): number {
    const weighted =
      dto.priceScore * WEIGHTS.price +
      dto.qualityScore * WEIGHTS.quality +
      dto.deliveryScore * WEIGHTS.delivery +
      dto.responseScore * WEIGHTS.response +
      dto.cooperationScore * WEIGHTS.cooperation;

    const score = (weighted / 5) * 100 - (dto.complaintRate ?? 0);
    return Number(Math.min(100, Math.max(0, score)).toFixed(2));
  }

  async findAll(dto: PaginationDto, supplierId?: string) {
    const where: Prisma.SupplierPerformanceWhereInput = supplierId
      ? { supplierId }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierPerformance.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { periodEnd: 'desc' },
        include: {
          supplier: { select: { id: true, code: true, companyName: true } },
          evaluator: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.supplierPerformance.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async create(dto: CreatePerformanceDto, userId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Không tìm thấy nhà cung cấp');

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException('Kỳ đánh giá không hợp lệ');
    }

    const totalScore = PerformanceService.computeTotal(dto);

    const review = await this.prisma.supplierPerformance.create({
      data: {
        supplierId: dto.supplierId,
        evaluatorId: userId,
        periodStart,
        periodEnd,
        priceScore: dto.priceScore,
        qualityScore: dto.qualityScore,
        deliveryScore: dto.deliveryScore,
        responseScore: dto.responseScore,
        cooperationScore: dto.cooperationScore,
        complaintRate: dto.complaintRate ?? 0,
        totalScore,
        note: dto.note,
      },
      include: {
        supplier: { select: { id: true, code: true, companyName: true } },
        evaluator: { select: { id: true, fullName: true } },
      },
    });

    await this.refreshRating(dto.supplierId);
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'supplier_performance',
      entityId: review.id,
      newValue: { supplierId: dto.supplierId, totalScore },
    });

    return review;
  }

  /** Supplier ranking by average score across all recorded evaluations. */
  async ranking(limit = 20) {
    const grouped = await this.prisma.supplierPerformance.groupBy({
      by: ['supplierId'],
      _avg: {
        totalScore: true,
        priceScore: true,
        qualityScore: true,
        deliveryScore: true,
        responseScore: true,
        cooperationScore: true,
      },
      _count: { _all: true },
    });

    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: grouped.map((g) => g.supplierId) } },
      select: { id: true, code: true, companyName: true, status: true },
    });
    const byId = new Map(suppliers.map((s) => [s.id, s]));

    return grouped
      .map((g) => ({
        supplier: byId.get(g.supplierId) ?? null,
        evaluations: g._count._all,
        averageScore: Number((g._avg.totalScore ?? 0).toFixed(2)),
        breakdown: {
          price: Number((g._avg.priceScore ?? 0).toFixed(2)),
          quality: Number((g._avg.qualityScore ?? 0).toFixed(2)),
          delivery: Number((g._avg.deliveryScore ?? 0).toFixed(2)),
          response: Number((g._avg.responseScore ?? 0).toFixed(2)),
          cooperation: Number((g._avg.cooperationScore ?? 0).toFixed(2)),
        },
      }))
      .filter((r) => r.supplier)
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, limit);
  }

  /** Mirrors the running average onto the supplier for cheap sorting elsewhere. */
  private async refreshRating(supplierId: string) {
    const agg = await this.prisma.supplierPerformance.aggregate({
      where: { supplierId },
      _avg: { totalScore: true },
    });
    await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ratingAvg: agg._avg.totalScore
          ? new Prisma.Decimal(Number(agg._avg.totalScore).toFixed(2))
          : null,
      },
    });
  }
}
