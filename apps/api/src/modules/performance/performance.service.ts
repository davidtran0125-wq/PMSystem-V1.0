import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { CreatePerformanceDto } from './dto/performance.dto';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(dto: PaginationDto, supplierId?: string) {
    const where: Prisma.SupplierPerformanceWhereInput = {
      ...(supplierId ? { supplierId } : {}),
      // Tìm theo tên nhà cung cấp, vì lịch sử đánh giá dài rất nhanh.
      ...(dto.search
        ? {
            supplier: {
              OR: [
                { companyName: { contains: dto.search, mode: 'insensitive' } },
                { code: { contains: dto.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierPerformance.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { periodEnd: 'desc' },
        include: {
          supplier: { select: { id: true, code: true, companyName: true } },
          evaluator: { select: { id: true, fullName: true } },
          scores: { include: { criteria: true } },
        },
      }),
      this.prisma.supplierPerformance.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  /**
   * Scores are weighted by each criteria's configured weight and normalised by
   * the total weight actually used, so the result is 0–100 even when the
   * configured weights do not add up to exactly 100. The complaint rate is a
   * penalty applied after weighting rather than a scored criterion.
   */
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
    if (!dto.scores.length) {
      throw new BadRequestException('Chấm điểm ít nhất một tiêu chí');
    }

    const criteriaIds = dto.scores.map((s) => s.criteriaId);
    if (new Set(criteriaIds).size !== criteriaIds.length) {
      throw new BadRequestException('Một tiêu chí chỉ được chấm một lần');
    }

    const criteria = await this.prisma.evaluationCriteria.findMany({
      where: { id: { in: criteriaIds }, deletedAt: null, isActive: true },
    });
    if (criteria.length !== criteriaIds.length) {
      throw new BadRequestException('Có tiêu chí không tồn tại hoặc đã bị tắt');
    }

    const byId = new Map(criteria.map((c) => [c.id, c]));
    for (const entry of dto.scores) {
      const c = byId.get(entry.criteriaId)!;
      if (entry.score < 1 || entry.score > c.maxScore) {
        throw new BadRequestException(
          `Điểm của "${c.name}" phải từ 1 đến ${c.maxScore}`,
        );
      }
    }

    const totalScore = this.computeTotal(dto, byId);

    const review = await this.prisma.supplierPerformance.create({
      data: {
        supplierId: dto.supplierId,
        evaluatorId: userId,
        periodStart,
        periodEnd,
        complaintRate: dto.complaintRate ?? 0,
        totalScore,
        note: dto.note,
        scores: {
          create: dto.scores.map((entry) => ({
            criteriaId: entry.criteriaId,
            score: entry.score,
            comment: entry.comment,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, code: true, companyName: true } },
        evaluator: { select: { id: true, fullName: true } },
        scores: { include: { criteria: true } },
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

  private computeTotal(
    dto: CreatePerformanceDto,
    byId: Map<string, { weight: Prisma.Decimal; maxScore: number }>,
  ): number {
    let weighted = 0;
    let totalWeight = 0;

    for (const entry of dto.scores) {
      const c = byId.get(entry.criteriaId)!;
      const weight = Number(c.weight);
      // Normalise each score onto 0–1 before weighting so criteria with
      // different maximums stay comparable.
      weighted += (entry.score / c.maxScore) * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;
    const score = (weighted / totalWeight) * 100 - (dto.complaintRate ?? 0);
    return Number(Math.min(100, Math.max(0, score)).toFixed(2));
  }

  /** Supplier ranking by average score, with a per-criteria breakdown. */
  async ranking(limit = 20) {
    const grouped = await this.prisma.supplierPerformance.groupBy({
      by: ['supplierId'],
      _avg: { totalScore: true },
      _count: { _all: true },
    });

    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: grouped.map((g) => g.supplierId) } },
      select: { id: true, code: true, companyName: true, status: true },
    });
    const byId = new Map(suppliers.map((s) => [s.id, s]));

    const scores = await this.prisma.supplierPerformanceScore.findMany({
      where: {
        performance: { supplierId: { in: grouped.map((g) => g.supplierId) } },
      },
      include: {
        criteria: { select: { id: true, name: true, maxScore: true } },
        performance: { select: { supplierId: true } },
      },
    });

    const breakdownBySupplier = new Map<
      string,
      Map<
        string,
        { name: string; maxScore: number; total: number; count: number }
      >
    >();
    for (const s of scores) {
      const supplierId = s.performance.supplierId;
      const perSupplier =
        breakdownBySupplier.get(supplierId) ??
        new Map<
          string,
          { name: string; maxScore: number; total: number; count: number }
        >();
      const entry = perSupplier.get(s.criteriaId) ?? {
        name: s.criteria.name,
        maxScore: s.criteria.maxScore,
        total: 0,
        count: 0,
      };
      entry.total += s.score;
      entry.count += 1;
      perSupplier.set(s.criteriaId, entry);
      breakdownBySupplier.set(supplierId, perSupplier);
    }

    return grouped
      .map((g) => ({
        supplier: byId.get(g.supplierId) ?? null,
        evaluations: g._count._all,
        averageScore: Number((g._avg.totalScore ?? 0).toFixed(2)),
        breakdown: [
          ...(breakdownBySupplier.get(g.supplierId)?.entries() ?? []),
        ].map(([criteriaId, v]) => ({
          criteriaId,
          name: v.name,
          maxScore: v.maxScore,
          average: Number((v.total / v.count).toFixed(2)),
        })),
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
