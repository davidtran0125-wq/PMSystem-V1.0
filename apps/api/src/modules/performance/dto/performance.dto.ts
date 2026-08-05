import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreatePerformanceDto {
  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  periodEnd!: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Giá' })
  @IsInt()
  @Min(1)
  @Max(5)
  priceScore!: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Chất lượng' })
  @IsInt()
  @Min(1)
  @Max(5)
  qualityScore!: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Giao hàng' })
  @IsInt()
  @Min(1)
  @Max(5)
  deliveryScore!: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Thời gian phản hồi' })
  @IsInt()
  @Min(1)
  @Max(5)
  responseScore!: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Hợp tác' })
  @IsInt()
  @Min(1)
  @Max(5)
  cooperationScore!: number;

  @ApiPropertyOptional({ description: 'Tỷ lệ khiếu nại (%)', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  complaintRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
