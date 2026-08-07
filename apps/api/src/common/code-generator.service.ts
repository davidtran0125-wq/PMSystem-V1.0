import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Sequence = 'PR' | 'RFQ' | 'QT' | 'PO' | 'SUP' | 'MAT';

/**
 * Human readable business codes, e.g. PR-2026-00001. The counter is derived
 * inside the same transaction as the insert so concurrent creates cannot
 * collide on the unique index.
 */
@Injectable()
export class CodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async next(prefix: Sequence): Promise<string> {
    const year = new Date().getFullYear();
    const key = `sequence:${prefix}:${year}`;

    const [row] = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO settings (id, key, value, "updatedAt")
      VALUES (gen_random_uuid(), ${key}, '1'::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = ((settings.value::text)::int + 1)::text::jsonb,
                    "updatedAt" = NOW()
      RETURNING (value::text)::int AS value
    `;

    return `${prefix}-${year}-${String(row.value).padStart(5, '0')}`;
  }
}
