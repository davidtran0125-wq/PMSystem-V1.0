import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CertificateStatus, ContractStatus } from '@prisma/client';
import {
  BooleanQuery,
  PaginationDto,
} from '../../../common/dto/pagination.dto';

export class CreateContractDto {
  @ApiProperty({ example: 'HD-2026-001' })
  @IsString()
  @MaxLength(60)
  contractNumber!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  contractValue!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  renewalOption?: boolean;

  @ApiPropertyOptional({ enum: ContractStatus })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}

export class QueryContractDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ContractStatus })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ hợp đồng sắp hết hạn trong 90 ngày',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  expiringOnly?: boolean;
}

export class CreateCertificateDto {
  @ApiProperty({ example: 'ISO 9001:2015' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'ISO' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuedBy?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  issueDate!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  expiryDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCertificateDto extends PartialType(CreateCertificateDto) {}

export class QueryCertificateDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CertificateStatus })
  @IsOptional()
  @IsEnum(CertificateStatus)
  status?: CertificateStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ chứng chỉ sắp hết hạn trong 90 ngày',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  expiringOnly?: boolean;
}
