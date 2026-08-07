import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Priority, PurchaseRequestStatus } from '@prisma/client';
import {
  BooleanQuery,
  PaginationDto,
} from '../../../common/dto/pagination.dto';

export class PurchaseRequestItemDto {
  @ApiPropertyOptional({
    description: 'Mã vật tư trong danh mục. Bỏ trống nếu là hàng chưa có mã.',
  })
  @IsOptional()
  @IsUUID()
  materialId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  lineNo?: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specification?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity!: number;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(30)
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedPrice?: number;
}

export class CreatePurchaseRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Reason for the purchase' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Defaults to the requester department' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  neededByDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetAmount?: number;

  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ type: [PurchaseRequestItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items?: PurchaseRequestItemDto[];

  @ApiPropertyOptional({
    description: 'Values for the category dynamic form, keyed by field key',
    example: { casNumber: '7647-01-0', concentration: '37%' },
  })
  @IsOptional()
  @IsObject()
  dynamicValues?: Record<string, unknown>;
}

export class UpdatePurchaseRequestDto extends PartialType(
  CreatePurchaseRequestDto,
) {}

export class ReviewDecisionDto {
  @ApiPropertyOptional({
    description: 'Required when rejecting or asking for clarification',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class QueryPurchaseRequestDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PurchaseRequestStatus })
  @IsOptional()
  @IsEnum(PurchaseRequestStatus)
  status?: PurchaseRequestStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Only my own requests' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  mine?: boolean;
}
