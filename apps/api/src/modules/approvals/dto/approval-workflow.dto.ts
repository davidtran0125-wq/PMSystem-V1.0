import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalTarget } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApprovalStepDto {
  @ApiProperty({ example: 'Trưởng bộ phận duyệt' })
  @IsString()
  @MaxLength(120)
  name!: string;

  /** Bỏ trống nghĩa là ai cũng duyệt được cấp này. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Hạn xử lý, tính bằng giờ' })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

export class UpsertApprovalWorkflowDto {
  @ApiProperty({ example: 'Đơn hàng dưới 100 triệu' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ApprovalTarget })
  @IsOptional()
  @IsEnum(ApprovalTarget)
  appliesTo?: ApprovalTarget;

  @ApiPropertyOptional({
    description: 'Áp dụng riêng cho một lĩnh vực mua hàng',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Áp dụng riêng cho một bộ phận' })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({
    description: 'Giá trị từ (bao gồm). Bỏ trống là không giới hạn dưới.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number | null;

  @ApiPropertyOptional({
    description:
      'Giá trị đến (không bao gồm). Bỏ trống là không giới hạn trên.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number | null;

  @ApiPropertyOptional({
    description: 'Số càng lớn càng được ưu tiên khi nhiều luồng cùng khớp',
  })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [ApprovalStepDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}

export class QueryApprovalWorkflowDto {
  @ApiPropertyOptional({ enum: ApprovalTarget })
  @IsOptional()
  @IsEnum(ApprovalTarget)
  appliesTo?: ApprovalTarget;
}

/** Thử một giá trị để xem luồng nào sẽ được áp dụng. */
export class PreviewRoutingDto {
  @ApiProperty({ example: 250_000_000 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ enum: ApprovalTarget })
  @IsOptional()
  @IsEnum(ApprovalTarget)
  appliesTo?: ApprovalTarget;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
