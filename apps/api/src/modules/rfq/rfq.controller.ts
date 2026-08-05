import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RfqService } from './rfq.service';
import {
  AwardRfqDto,
  CreateRfqDto,
  QueryRfqDto,
  SubmitQuotationDto,
  UpdateRfqDto,
} from './dto/rfq.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('RFQ')
@ApiBearerAuth()
@Controller('rfqs')
export class RfqController {
  constructor(private readonly service: RfqService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RFQ_READ)
  @ApiOperation({ summary: 'List RFQs visible to the caller' })
  findAll(@Query() dto: QueryRfqDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(dto, user);
  }

  @Get('my-quotations')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Quotation history of the signed-in supplier' })
  myQuotations(@CurrentUser() user: AuthUser, @Query() dto: QueryRfqDto) {
    return this.service.myQuotations(user, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RFQ_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Get(':id/compare')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Side-by-side quotation comparison' })
  compare(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.compare(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RFQ_WRITE)
  @ApiOperation({
    summary: 'Generate an RFQ from an approved purchase request',
  })
  create(@Body() dto: CreateRfqDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RFQ_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRfqDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.RFQ_WRITE)
  @ApiOperation({ summary: 'Send the RFQ to the invited suppliers' })
  send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.send(id, user);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.RFQ_WRITE)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.close(id, user);
  }

  @Post(':id/award')
  @RequirePermissions(PERMISSIONS.RFQ_AWARD)
  @ApiOperation({ summary: 'Pick the winning quotation' })
  award(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AwardRfqDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.award(id, dto, user);
  }

  @Post(':id/view')
  @RequirePermissions(PERMISSIONS.RFQ_READ)
  @ApiOperation({ summary: 'Supplier acknowledges the invitation' })
  markViewed(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markViewed(id, user);
  }

  @Post(':id/quotations')
  @RequirePermissions(PERMISSIONS.QUOTATION_WRITE)
  @ApiOperation({ summary: 'Supplier submits a quotation' })
  submitQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitQuotationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submitQuotation(id, dto, user);
  }
}
