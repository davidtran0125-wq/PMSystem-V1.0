import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã vai trò, ví dụ BUYER' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateUserDto {
  @ApiProperty({ example: 'nguyenvana@congty.vn' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ type: [String], description: 'Ít nhất một vai trò' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}

/** Admin sửa hồ sơ người khác: gồm cả trạng thái tài khoản. */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/** Người dùng tự sửa hồ sơ của mình: không đụng tới vai trò hay trạng thái. */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ enum: ['vi', 'en'] })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  locale?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateUserRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
