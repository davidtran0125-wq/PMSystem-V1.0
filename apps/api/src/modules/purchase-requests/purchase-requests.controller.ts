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
import { PurchaseRequestsService } from './purchase-requests.service';
import {
  CreatePurchaseRequestDto,
  QueryPurchaseRequestDto,
  ReviewDecisionDto,
  UpdatePurchaseRequestDto,
} from './dto/purchase-request.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Purchase Requests')
@ApiBearerAuth()
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PR_READ)
  @ApiOperation({ summary: 'List purchase requests visible to the caller' })
  findAll(
    @Query() dto: QueryPurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findAll(dto, user);
  }

  @Get('pending-approval')
  @RequirePermissions(PERMISSIONS.PR_REVIEW)
  @ApiOperation({ summary: 'Yêu cầu đang chờ chính bạn duyệt' })
  pendingForMe(
    @Query() dto: QueryPurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.pendingForMe(user, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PR_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PR_WRITE)
  @ApiOperation({ summary: 'Create a draft purchase request' })
  create(@Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PR_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.PR_WRITE)
  @ApiOperation({ summary: 'Submit a draft or clarified request for review' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submit(id, user);
  }

  @Post(':id/start-review')
  @RequirePermissions(PERMISSIONS.PR_REVIEW)
  @ApiOperation({ summary: 'Buyer takes ownership of the review' })
  startReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.startReview(id, user);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.PR_REVIEW)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.approve(id, dto, user);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.PR_REVIEW)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reject(id, dto, user);
  }

  @Post(':id/request-clarification')
  @RequirePermissions(PERMISSIONS.PR_REVIEW)
  @ApiOperation({ summary: 'Send the request back to the requester' })
  requestClarification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.requestClarification(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PR_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user);
  }
}
