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
import { ContractsService } from './contracts.service';
import { ExpiryService } from './expiry.service';
import {
  CreateCertificateDto,
  CreateContractDto,
  QueryCertificateDto,
  QueryContractDto,
  UpdateCertificateDto,
  UpdateContractDto,
} from './dto/contract.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Contracts & Certificates')
@ApiBearerAuth()
@Controller()
export class ContractsController {
  constructor(
    private readonly service: ContractsService,
    private readonly expiry: ExpiryService,
  ) {}

  // ---------------------------------------------------------------- contracts

  @Get('contracts')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Danh sách hợp đồng, kèm số ngày còn lại' })
  findAll(@Query() dto: QueryContractDto) {
    return this.service.findAll(dto);
  }

  @Get('contracts/status-counts')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Số hợp đồng theo từng trạng thái' })
  contractStatusCounts(@Query() dto: QueryContractDto) {
    return this.service.statusCounts(dto);
  }

  @Get('contracts/:id')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post('contracts')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  create(@Body() dto: CreateContractDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Patch('contracts/:id')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete('contracts/:id')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.remove(id, userId);
  }

  // ------------------------------------------------------------- certificates

  @Get('certificates')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  @ApiOperation({ summary: 'Danh sách chứng chỉ nhà cung cấp' })
  findCertificates(@Query() dto: QueryCertificateDto) {
    return this.service.findCertificates(dto);
  }

  @Get('certificates/status-counts')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  @ApiOperation({ summary: 'Số chứng chỉ theo từng trạng thái' })
  certificateStatusCounts(@Query() dto: QueryCertificateDto) {
    return this.service.certificateStatusCounts(dto);
  }

  @Post('certificates')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_WRITE)
  createCertificate(
    @Body() dto: CreateCertificateDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createCertificate(dto, userId);
  }

  @Patch('certificates/:id')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_WRITE)
  updateCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificateDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateCertificate(id, dto, userId);
  }

  @Delete('certificates/:id')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_WRITE)
  removeCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.removeCertificate(id, userId);
  }

  // ------------------------------------------------------------------ manual

  @Post('reminders/run')
  @RequirePermissions(PERMISSIONS.SETTING_WRITE)
  @ApiOperation({
    summary: 'Chạy ngay job quét hạn (bình thường tự chạy mỗi giờ)',
  })
  runReminders() {
    return this.expiry.processDueReminders();
  }
}
