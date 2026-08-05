import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  module: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Audit rows are append-only: the service exposes no update or delete path. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          module: entry.module,
          entityId: entry.entityId ?? null,
          oldValue: this.toJson(entry.oldValue),
          newValue: this.toJson(entry.newValue),
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (error) {
      // Auditing must never break the business operation that triggered it.
      this.logger.error(
        `Failed to write audit log for ${entry.module}:${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll(
    dto: PaginationDto,
    filters: { module?: string; userId?: string },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
