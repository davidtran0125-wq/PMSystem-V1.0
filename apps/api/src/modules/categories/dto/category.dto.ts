import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FieldType } from '@prisma/client';
import {
  BooleanQuery,
  PaginationDto,
} from '../../../common/dto/pagination.dto';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameEn?: string;

  @ApiProperty({ example: 'CHEMICAL' })
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'code must contain only A-Z, 0-9 and underscore',
  })
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'true = mua hàng hóa, mỗi dòng phải chọn mã vật tư. false = mua dịch vụ, nhập tự do.',
  })
  @IsOptional()
  @IsBoolean()
  requiresMaterial?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class FieldOptionDto {
  @ApiProperty()
  @IsString()
  value!: string;

  @ApiProperty()
  @IsString()
  label!: string;
}

export class DynamicFieldDto {
  @ApiProperty({ example: 'casNumber' })
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: 'key must be a valid identifier',
  })
  @MaxLength(60)
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  labelEn?: string;

  @ApiProperty({ enum: FieldType })
  @IsEnum(FieldType)
  type!: FieldType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  helpText?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [FieldOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOptionDto)
  options?: FieldOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;
}

export class QueryCategoryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Exclude archived categories' })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  activeOnly?: boolean;
}

export class UpsertDynamicFormDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ type: [DynamicFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicFieldDto)
  fields!: DynamicFieldDto[];
}
