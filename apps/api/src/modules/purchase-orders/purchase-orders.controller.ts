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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderPdfService } from './purchase-order-pdf.service';
import {
  CancelPurchaseOrderDto,
  CreateFromRequestDto,
  CreateFromRfqDto,
  QueryPurchaseOrderDto,
  ReviewOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly service: PurchaseOrdersService,
    private readonly pdf: PurchaseOrderPdfService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PO_READ)
  @ApiOperation({ summary: 'Danh sách đơn hàng caller được phép xem' })
  findAll(@Query() dto: QueryPurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(dto, user);
  }

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.PO_READ)
  @ApiOperation({
    summary: 'Tải đơn hàng dạng PDF để in hoặc gửi nhà cung cấp',
  })
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdf.render(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.end(buffer);
  }

  @Get(':id/revisions')
  @RequirePermissions(PERMISSIONS.PO_READ)
  @ApiOperation({
    summary: 'Lịch sử chỉnh sửa đơn hàng, kèm đúng những trường đã đổi',
  })
  revisions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.revisions(id, user);
  }

  @Get('status-counts')
  @RequirePermissions(PERMISSIONS.PO_READ)
  @ApiOperation({ summary: 'Số đơn hàng theo từng trạng thái' })
  statusCounts(
    @Query() dto: QueryPurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.statusCounts(dto, user);
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
  @ApiOperation({
    summary:
      'Sửa đơn hàng. Đơn đã trình duyệt hoặc đã duyệt sẽ quay về nháp và phải duyệt lại từ đầu.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Get('pending-approval/mine')
  @RequirePermissions(PERMISSIONS.PO_APPROVE)
  @ApiOperation({ summary: 'Đơn hàng đang chờ chính tôi duyệt' })
  pendingForMe(@CurrentUser() user: AuthUser) {
    return this.service.pendingForMe(user);
  }

  @Post(':id/submit-for-approval')
  @RequirePermissions(PERMISSIONS.PO_WRITE)
  @ApiOperation({
    summary: 'Trình đơn hàng đi duyệt. Chuỗi duyệt chốt theo giá trị đơn.',
  })
  submitForApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submitForApproval(id, user);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.PO_APPROVE)
  @ApiOperation({
    summary: 'Duyệt cấp hiện tại. Các cấp phải đi lần lượt, không nhảy cóc.',
  })
  approveStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.approveStep(id, dto.comment, user);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.PO_APPROVE)
  @ApiOperation({ summary: 'Trả đơn về nháp, bắt buộc nêu lý do' })
  rejectApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rejectApproval(id, dto.comment ?? '', user);
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
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user);
  }
}
