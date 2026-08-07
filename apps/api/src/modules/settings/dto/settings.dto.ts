import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  website?: string;

  @ApiPropertyOptional({ description: 'Người đại diện ký đơn hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  representative?: string;

  @ApiPropertyOptional({ description: 'Chức danh người đại diện' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  representativeTitle?: string;
}

export class CreateCriteriaDto {
  @ApiProperty({ example: 'Chất lượng' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả cách chấm điểm tiêu chí này' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Trọng số (%), tổng các tiêu chí đang bật nên bằng 100',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight!: number;

  @ApiPropertyOptional({ default: 5, description: 'Thang điểm tối đa' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  maxScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCriteriaDto extends PartialType(CreateCriteriaDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCriteriaDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];
}
