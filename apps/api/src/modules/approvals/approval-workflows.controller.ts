import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalWorkflowsService } from './approval-workflows.service';
import {
  PreviewRoutingDto,
  QueryApprovalWorkflowDto,
  UpsertApprovalWorkflowDto,
} from './dto/approval-workflow.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Approval workflows')
@ApiBearerAuth()
@Controller('approval-workflows')
export class ApprovalWorkflowsController {
  constructor(private readonly service: ApprovalWorkflowsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  @ApiOperation({ summary: 'Danh sách luồng duyệt đã cấu hình' })
  findAll(@Query() dto: QueryApprovalWorkflowDto) {
    return this.service.findAll(dto);
  }

  @Post('preview')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  @ApiOperation({ summary: 'Thử một số tiền để xem luồng nào được áp dụng' })
  preview(@Body() dto: PreviewRoutingDto) {
    return this.service.preview(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  create(
    @Body() dto: UpsertApprovalWorkflowDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertApprovalWorkflowDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.remove(id, userId);
  }
}
