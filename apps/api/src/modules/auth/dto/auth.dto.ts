import { EmptyToUndefined } from '../../../common/dto/transforms';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@pms.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class SupplierRegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  contactPerson!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  companyName!: string;

  // Ô để trống gửi lên chuỗi rỗng; `taxCode` là cột duy nhất nên chuỗi rỗng thứ
  // hai sẽ va vào ràng buộc và làm hỏng đăng ký của mọi nhà cung cấp sau đó.
  @ApiPropertyOptional()
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  phone?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
