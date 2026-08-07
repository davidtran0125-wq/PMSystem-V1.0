import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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

export class CriteriaScoreDto {
  @ApiProperty({
    description: 'Tiêu chí đánh giá, cấu hình trong phần Thiết lập',
  })
  @IsUUID()
  criteriaId!: string;

  @ApiProperty({ description: 'Điểm chấm, từ 1 đến thang điểm của tiêu chí' })
  @IsInt()
  @Min(1)
  score!: number;

  @ApiPropertyOptional({ description: 'Nhận xét riêng cho tiêu chí này' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

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

  @ApiProperty({
    type: [CriteriaScoreDto],
    description: 'Điểm và nhận xét từng tiêu chí',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CriteriaScoreDto)
  scores!: CriteriaScoreDto[];

  @ApiPropertyOptional({
    description: 'Tỷ lệ khiếu nại (%), trừ thẳng vào điểm tổng',
    default: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  complaintRate?: number;

  @ApiPropertyOptional({ description: 'Nhận xét chung cho cả kỳ' })
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * `ValidationPipe` bật whitelist + forbidNonWhitelisted, nên `supplierId` phải
 * được khai báo ở DTO chứ không thể chỉ đọc qua @Query rời.
 */
export class QueryPerformanceDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
