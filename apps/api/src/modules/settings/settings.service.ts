import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCriteriaDto,
  UpdateCriteriaDto,
  UpdateCompanyDto,
} from './dto/settings.dto';

/** Company details printed on the purchase order PDF. */
export const COMPANY_KEY = 'company.profile';

export interface CompanyProfile {
  name: string;
  taxCode: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  representative: string;
  representativeTitle: string;
}

const DEFAULT_COMPANY: CompanyProfile = {
  name: 'Công ty của bạn',
  taxCode: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  representative: '',
  representativeTitle: '',
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- company

  async company(): Promise<CompanyProfile> {
    const row = await this.prisma.setting.findUnique({
      where: { key: COMPANY_KEY },
    });
    return { ...DEFAULT_COMPANY, ...((row?.value as object) ?? {}) };
  }

  async updateCompany(dto: UpdateCompanyDto, userId: string) {
    const current = await this.company();
    const value = { ...current, ...dto } as unknown as Prisma.InputJsonValue;

    await this.prisma.setting.upsert({
      where: { key: COMPANY_KEY },
      update: { value },
      create: {
        key: COMPANY_KEY,
        value,
        description: 'Thông tin công ty in trên đơn hàng',
      },
    });

    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'setting',
      entityId: COMPANY_KEY,
      oldValue: current,
      newValue: value,
    });

    return this.company();
  }

  // ---------------------------------------------------- evaluation criteria

  criteria(includeInactive = false) {
    return this.prisma.evaluationCriteria.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Total weight of the active criteria. Scores are normalised by this rather
   * than assuming 100, so an unbalanced set still produces a 0–100 result —
   * but the UI warns when it drifts so the configuration stays intentional.
   */
  async criteriaSummary() {
    const active = await this.criteria();
    const totalWeight = active.reduce((sum, c) => sum + Number(c.weight), 0);
    return {
      criteria: active,
      totalWeight: Number(totalWeight.toFixed(2)),
      balanced: Math.abs(totalWeight - 100) < 0.01,
    };
  }

  async createCriteria(dto: CreateCriteriaDto, userId: string) {
    const created = await this.prisma.evaluationCriteria.create({
      data: {
        name: dto.name,
        description: dto.description,
        weight: dto.weight,
        maxScore: dto.maxScore ?? 5,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'evaluation_criteria',
      entityId: created.id,
      newValue: { name: created.name, weight: created.weight.toString() },
    });
    return created;
  }

  async updateCriteria(id: string, dto: UpdateCriteriaDto, userId: string) {
    const current = await this.prisma.evaluationCriteria.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Không tìm thấy tiêu chí');

    const updated = await this.prisma.evaluationCriteria.update({
      where: { id },
      data: dto,
    });
    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'evaluation_criteria',
      entityId: id,
      oldValue: { name: current.name, weight: current.weight.toString() },
      newValue: { name: updated.name, weight: updated.weight.toString() },
    });
    return updated;
  }

  async removeCriteria(id: string, userId: string) {
    const current = await this.prisma.evaluationCriteria.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Không tìm thấy tiêu chí');

    // Past evaluations reference the criteria, so retire it instead of deleting
    // and keep those scores readable.
    const used = await this.prisma.supplierPerformanceScore.count({
      where: { criteriaId: id },
    });
    if (used > 0) {
      const retired = await this.prisma.evaluationCriteria.update({
        where: { id },
        data: { isActive: false },
      });
      await this.audit.record({
        userId,
        action: 'DEACTIVATE',
        module: 'evaluation_criteria',
        entityId: id,
        oldValue: { name: current.name, usedInEvaluations: used },
      });
      return {
        success: true,
        deactivated: true,
        message: `Tiêu chí đã dùng trong ${used} lượt đánh giá nên chỉ được tắt, không xóa hẳn.`,
        criteria: retired,
      };
    }

    await this.prisma.evaluationCriteria.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      userId,
      action: 'DELETE',
      module: 'evaluation_criteria',
      entityId: id,
      oldValue: { name: current.name },
    });
    return { success: true, deactivated: false };
  }

  async reorderCriteria(ids: string[], userId: string) {
    if (!ids.length) throw new BadRequestException('Danh sách trống');

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.evaluationCriteria.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.audit.record({
      userId,
      action: 'REORDER',
      module: 'evaluation_criteria',
      newValue: { order: ids },
    });
    return this.criteria(true);
  }
}
