import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  ChangePasswordDto,
  CreateUserDto,
  QueryUsersDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdateUserRolesDto,
} from './dto/user.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  // --- Hồ sơ cá nhân: ai đăng nhập cũng dùng được, không cần quyền riêng ----

  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ của chính mình' })
  me(@CurrentUser('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Tự cập nhật thông tin cơ bản' })
  updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.updateProfile(dto, user);
  }

  @Post('me/password')
  @ApiOperation({
    summary:
      'Đổi mật khẩu. Các thiết bị khác bị đăng xuất; thiết bị hiện tại nhận cặp token mới.',
  })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.service.changePassword(dto, user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // --- Quản trị người dùng --------------------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Danh sách tài khoản nội bộ' })
  findAll(@Query() dto: QueryUsersDto) {
    return this.service.findAll(dto);
  }

  @Get('status-counts')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Số tài khoản theo từng trạng thái' })
  statusCounts(@Query() dto: QueryUsersDto) {
    return this.service.statusCounts(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @ApiOperation({ summary: 'Tạo tài khoản người dùng mới' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @ApiOperation({ summary: 'Sửa thông tin hoặc khóa / mở khóa tài khoản' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/roles')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @ApiOperation({ summary: 'Thay toàn bộ vai trò của một tài khoản' })
  updateRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateRoles(id, dto, user);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @ApiOperation({ summary: 'Đặt lại mật khẩu hộ người dùng' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.resetPassword(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @ApiOperation({ summary: 'Xóa mềm tài khoản, giữ lại lịch sử thao tác' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user);
  }
}
