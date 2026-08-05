import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateDepartmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'PROD' })
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  @MaxLength(20)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'PRJ-2026-01' })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budget?: number;
}

export class UpdateUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by role code, e.g. BUYER' })
  @IsOptional()
  @IsString()
  role?: string;
}
