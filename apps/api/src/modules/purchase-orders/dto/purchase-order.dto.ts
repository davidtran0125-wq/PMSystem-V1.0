import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class PurchaseOrderItemDto {
  @ApiPropertyOptional({ description: 'Mã vật tư trong danh mục' })
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

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

/** Common editable header fields, shared by create and update. */
class PurchaseOrderHeaderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Phần trăm thuế VAT, ví dụ 8 hoặc 10' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  deliveryTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  warranty?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Generated from an awarded RFQ: lines and unit prices default to the winning
 * quotation, so the buyer normally only fills in delivery details.
 */
export class CreateFromRfqDto extends PurchaseOrderHeaderDto {
  @ApiProperty({ description: 'RFQ đã chọn nhà cung cấp trúng thầu' })
  @IsUUID()
  rfqId!: string;

  @ApiPropertyOptional({
    description:
      'Báo giá trúng thầu để tạo đơn. Bắt buộc khi RFQ có nhiều nhà cung cấp trúng thầu.',
  })
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiPropertyOptional({
    type: [PurchaseOrderItemDto],
    description:
      'Bỏ trống để lấy nguyên dòng hàng và đơn giá từ báo giá trúng thầu',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];
}

/** Direct order against an approved request, for purchases that skipped the RFQ. */
export class CreateFromRequestDto extends PurchaseOrderHeaderDto {
  @ApiProperty()
  @IsUUID()
  purchaseRequestId!: string;

  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends PurchaseOrderHeaderDto {
  @ApiPropertyOptional({ type: [PurchaseOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];
}

export class CancelPurchaseOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class ReviewOrderDto {
  @ApiPropertyOptional({ description: 'Bắt buộc khi từ chối' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class QueryPurchaseOrderDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Lọc các đơn hàng sinh ra từ một RFQ' })
  @IsOptional()
  @IsUUID()
  rfqId?: string;

  @ApiPropertyOptional({
    description: 'Lọc các đơn hàng của một yêu cầu mua hàng',
  })
  @IsOptional()
  @IsUUID()
  purchaseRequestId?: string;
}
