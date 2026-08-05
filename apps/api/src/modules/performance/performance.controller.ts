import { Body, Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { CreatePerformanceDto } from './dto/performance.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Supplier Performance')
@ApiBearerAuth()
@Controller('supplier-performance')
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'Lịch sử đánh giá nhà cung cấp' })
  findAll(@Query() dto: PaginationDto, @Query('supplierId') supplierId?: string) {
    return this.service.findAll(dto, supplierId);
  }

  @Get('ranking')
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'Xếp hạng nhà cung cấp theo điểm trung bình' })
  ranking(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.service.ranking(limit ?? 20);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIER_WRITE)
  @ApiOperation({ summary: 'Chấm điểm nhà cung cấp cho một kỳ' })
  create(@Body() dto: CreatePerformanceDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }
}
