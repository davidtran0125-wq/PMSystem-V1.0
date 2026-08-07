import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
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
import { QuotationStatus, RfqStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateRfqDto {
  @ApiProperty()
  @IsUUID()
  purchaseRequestId!: string;

  @ApiPropertyOptional({
    description: 'Defaults to the purchase request title',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ type: [String], description: 'Approved suppliers to invite' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  supplierIds!: string[];
}

export class UpdateRfqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  supplierIds?: string[];
}

export class QueryRfqDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RfqStatus })
  @IsOptional()
  @IsEnum(RfqStatus)
  status?: RfqStatus;

  /** Dùng cho danh sách báo giá của nhà cung cấp, không phải trạng thái RFQ. */
  @ApiPropertyOptional({ enum: QuotationStatus })
  @IsOptional()
  @IsEnum(QuotationStatus)
  quotationStatus?: QuotationStatus;
}

export class QuotationItemDto {
  @ApiPropertyOptional({ description: 'Links the line back to the PR item' })
  @IsOptional()
  @IsUUID()
  purchaseRequestItemId?: string;

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

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(30)
  unit!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class SubmitQuotationDto {
  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  moq?: string;

  @ApiPropertyOptional({ description: 'Lead time in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  paymentTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  incoterm?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  deliveryTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({ type: [QuotationItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}

export class AwardItemDto {
  @ApiProperty({ description: 'Báo giá được trao thầu' })
  @IsUUID()
  quotationId!: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Các dòng hàng trúng thầu của báo giá này. Bỏ trống nghĩa là trao toàn bộ báo giá.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  itemIds?: string[];
}

export class AwardRfqDto {
  @ApiProperty({
    type: [AwardItemDto],
    description: 'Cho phép trao thầu cho nhiều nhà cung cấp cùng lúc',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AwardItemDto)
  awards!: AwardItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
