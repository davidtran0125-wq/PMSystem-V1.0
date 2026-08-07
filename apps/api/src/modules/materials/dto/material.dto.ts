import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  MaterialChangeStatus,
  MaterialChangeType,
  MaterialStatus,
} from '@prisma/client';
import {
  BooleanQuery,
  PaginationDto,
} from '../../../common/dto/pagination.dto';

/** Mã vật tư: chữ HOA, số, gạch ngang và gạch dưới — dễ đọc khi in ra chứng từ. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,29}$/;

export class MaterialFieldsDto {
  @ApiPropertyOptional({
    description:
      'Bỏ trống thì hệ thống tự cấp mã dạng MAT-2026-00001. Chỉ dùng khi tạo mới.',
    example: 'HC-NAOH-32',
  })
  @IsOptional()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(CODE_PATTERN, {
    message:
      'Mã chỉ gồm chữ HOA, số, dấu chấm, gạch ngang hoặc gạch dưới, dài 3–30 ký tự',
  })
  code?: string;

  @ApiProperty({ example: 'Xút NaOH 32%' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specification?: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MaxLength(30)
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  model?: string;

  @ApiPropertyOptional({ description: 'Mã HS dùng khi nhập khẩu' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string;

  @ApiPropertyOptional({ description: 'Giá tham chiếu để ước tính' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  standardPrice?: number;

  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock?: number;
}

export class CreateMaterialDto extends MaterialFieldsDto {
  @ApiPropertyOptional({
    description: 'Lý do cần mã mới, giúp người duyệt quyết định',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Sửa mã: mọi trường đều tùy chọn, chỉ gửi phần muốn đổi. */
export class UpdateMaterialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  standardPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RemoveMaterialDto {
  @ApiPropertyOptional({ description: 'Lý do ngừng dùng mã' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviewChangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class QueryMaterialDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MaterialStatus })
  @IsOptional()
  @IsEnum(MaterialStatus)
  status?: MaterialStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Chỉ lấy mã đang dùng được' })
  @IsOptional()
  @BooleanQuery()
  activeOnly?: boolean;

  // Lọc riêng từng cột của bảng danh mục.
}

export class QueryChangeRequestDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MaterialChangeStatus })
  @IsOptional()
  @IsEnum(MaterialChangeStatus)
  status?: MaterialChangeStatus;

  @ApiPropertyOptional({ enum: MaterialChangeType })
  @IsOptional()
  @IsEnum(MaterialChangeType)
  type?: MaterialChangeType;

  @ApiPropertyOptional({ description: 'Chỉ lấy đề xuất của chính mình' })
  @IsOptional()
  @BooleanQuery()
  mine?: boolean;
}
