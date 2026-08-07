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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaterialsService } from './materials.service';
import {
  CreateMaterialDto,
  QueryChangeRequestDto,
  QueryMaterialDto,
  RemoveMaterialDto,
  ReviewChangeDto,
  UpdateMaterialDto,
} from './dto/material.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  @ApiOperation({ summary: 'Danh mục mã vật tư' })
  findAll(@Query() dto: QueryMaterialDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(dto, user);
  }

  @Get('change-requests/status-counts')
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  @ApiOperation({ summary: 'Số đề xuất thay đổi mã theo từng trạng thái' })
  changeRequestStatusCounts(
    @Query() dto: QueryChangeRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.changeRequestStatusCounts(dto, user);
  }

  @Get('change-requests')
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  @ApiOperation({
    summary:
      'Đề xuất tạo / sửa / xóa mã. Người không có quyền duyệt chỉ thấy đề xuất của mình.',
  })
  changeRequests(
    @Query() dto: QueryChangeRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.changeRequests(dto, user);
  }

  @Get('price-summary')
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  @ApiOperation({
    summary:
      'Tóm tắt giá nhiều mã cùng lúc: giá thấp nhất, bình quân, lần mua gần nhất',
    description: 'Danh sách id ngăn cách bằng dấu phẩy qua tham số ids.',
  })
  priceSummary(@CurrentUser() user: AuthUser, @Query('ids') ids?: string) {
    return this.service.priceSummary(
      (ids ?? '').split(',').map((v) => v.trim()),
      user,
    );
  }

  @Get('status-counts')
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  @ApiOperation({ summary: 'Số mã vật tư theo từng trạng thái' })
  statusCounts(@Query() dto: QueryMaterialDto, @CurrentUser() user: AuthUser) {
    return this.service.statusCounts(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Get(':id/order-history')
  @RequirePermissions(PERMISSIONS.MATERIAL_READ)
  @ApiOperation({
    summary:
      'Lịch sử đặt hàng của một mã: đơn đã mua, giá bình quân gia quyền, khoảng giá và nhà cung cấp',
  })
  orderHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.orderHistory(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MATERIAL_WRITE)
  @ApiOperation({
    summary: 'Đề xuất mã mới. Mã ở trạng thái PENDING cho tới khi được duyệt.',
  })
  create(@Body() dto: CreateMaterialDto, @CurrentUser() user: AuthUser) {
    return this.service.requestCreate(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MATERIAL_WRITE)
  @ApiOperation({
    summary: 'Đề xuất điều chỉnh mã. Thay đổi chỉ áp dụng sau khi duyệt.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.requestUpdate(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MATERIAL_WRITE)
  @ApiOperation({
    summary:
      'Đề xuất xóa mã. Mã đã dùng trong đơn hàng chỉ chuyển sang ngừng dùng, không xóa hẳn.',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.requestRemove(id, dto, user);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.MATERIAL_WRITE)
  @ApiOperation({ summary: 'Đề xuất khôi phục mã đã ngừng dùng' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.requestRestore(id, dto, user);
  }

  @Post('change-requests/:id/approve')
  @RequirePermissions(PERMISSIONS.MATERIAL_APPROVE)
  @ApiOperation({ summary: 'Admin duyệt đề xuất và áp dụng thay đổi' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.approve(id, dto, user);
  }

  @Post('change-requests/:id/reject')
  @RequirePermissions(PERMISSIONS.MATERIAL_APPROVE)
  @ApiOperation({ summary: 'Từ chối đề xuất, bắt buộc nêu lý do' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reject(id, dto, user);
  }

  @Post('change-requests/:id/cancel')
  @RequirePermissions(PERMISSIONS.MATERIAL_WRITE)
  @ApiOperation({ summary: 'Người đề xuất rút lại đề xuất chưa được duyệt' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancel(id, user);
  }
}
