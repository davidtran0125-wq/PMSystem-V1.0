import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Query strings carry booleans as "true"/"false"; normalise them once here. */
export const BooleanQuery = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  });

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ description: 'Free text search' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy = 'createdAt';

  get skip() {
    return (this.page - 1) * this.pageSize;
  }
}

export class UnreadQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Return only unread notifications' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  unreadOnly?: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  dto: PaginationDto,
): Paginated<T> {
  return {
    data,
    meta: {
      page: dto.page,
      pageSize: dto.pageSize,
      total,
      totalPages: Math.ceil(total / dto.pageSize) || 1,
    },
  };
}
