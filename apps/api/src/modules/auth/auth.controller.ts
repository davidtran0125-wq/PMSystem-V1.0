import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  SupplierRegisterDto,
} from './dto/auth.dto';
import { CurrentUser, Public } from '../../common/decorators';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register an end user account' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, this.meta(req));
  }

  @Public()
  @Post('register/supplier')
  @ApiOperation({ summary: 'Register a supplier account (pending approval)' })
  registerSupplier(@Body() dto: SupplierRegisterDto, @Req() req: Request) {
    return this.authService.registerSupplier(dto, this.meta(req));
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive tokens' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.meta(req));
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, this.meta(req));
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user profile with roles and permissions' })
  me(@CurrentUser('id') userId: string) {
    return this.authService.profile(userId);
  }

  private meta(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }
}
