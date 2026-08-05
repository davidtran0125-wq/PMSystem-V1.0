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
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CancelPurchaseOrderDto,
  CreateFromRequestDto,
  CreateFromRfqDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PO_READ)
  @ApiOperation({ summary: 'Danh sách đơn hàng caller được phép xem' })
  findAll(@Query() dto: QueryPurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PO_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Post('from-rfq')
  @RequirePermissions(PERMISSIONS.PO_WRITE)
  @ApiOperation({
    summary: 'Tạo đơn hàng từ RFQ đã chọn NCC, lấy giá từ báo giá trúng thầu',
  })
  createFromRfq(@Body() dto: CreateFromRfqDto, @CurrentUser() user: AuthUser) {
    return this.service.createFromRfq(dto, user);
  }

  @Post('from-request')
  @RequirePermissions(PERMISSIONS.PO_WRITE)
  @ApiOperation({ summary: 'Tạo đơn hàng trực tiếp từ yêu cầu đã duyệt' })
  createFromRequest(
    @Body() dto: CreateFromRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createFromRequest(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PO_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/issue')
  @RequirePermissions(PERMISSIONS.PO_ISSUE)
  @ApiOperation({ summary: 'Phát hành đơn hàng tới nhà cung cấp' })
  issue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.issue(id, user);
  }

  @Post(':id/acknowledge')
  @RequirePermissions(PERMISSIONS.PO_ACKNOWLEDGE)
  @ApiOperation({ summary: 'Nhà cung cấp xác nhận đã nhận đơn hàng' })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.acknowledge(id, user);
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.PO_ISSUE)
  @ApiOperation({ summary: 'Đánh dấu đơn hàng đã hoàn tất' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.complete(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PO_ISSUE)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancel(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PO_WRITE)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
