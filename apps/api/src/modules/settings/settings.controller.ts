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
import { SettingsService } from './settings.service';
import {
  CreateCriteriaDto,
  ReorderCriteriaDto,
  UpdateCompanyDto,
  UpdateCriteriaDto,
} from './dto/settings.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('company')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({ summary: 'Thông tin công ty in trên đơn hàng' })
  company() {
    return this.service.company();
  }

  @Patch('company')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  updateCompany(
    @Body() dto: UpdateCompanyDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateCompany(dto, userId);
  }

  @Get('evaluation-criteria')
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'Tiêu chí đánh giá nhà cung cấp và tổng trọng số' })
  criteria(@Query('includeInactive') includeInactive?: string) {
    return includeInactive === 'true'
      ? this.service.criteria(true)
      : this.service.criteriaSummary();
  }

  @Post('evaluation-criteria')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  createCriteria(
    @Body() dto: CreateCriteriaDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createCriteria(dto, userId);
  }

  @Patch('evaluation-criteria/reorder')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  reorder(@Body() dto: ReorderCriteriaDto, @CurrentUser('id') userId: string) {
    return this.service.reorderCriteria(dto.ids, userId);
  }

  @Patch('evaluation-criteria/:id')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  updateCriteria(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCriteriaDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateCriteria(id, dto, userId);
  }

  @Delete('evaluation-criteria/:id')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  @ApiOperation({
    summary: 'Xóa tiêu chí. Nếu đã dùng trong đánh giá thì chỉ tắt đi.',
  })
  removeCriteria(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.removeCriteria(id, userId);
  }
}
