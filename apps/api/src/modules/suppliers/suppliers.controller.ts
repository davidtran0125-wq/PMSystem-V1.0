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
import { SuppliersService } from './suppliers.service';
import {
  QuerySupplierDto,
  SupplierDecisionDto,
  UpdateSupplierProfileDto,
} from './dto/supplier.dto';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @ApiOperation({ summary: 'List suppliers' })
  findAll(@Query() dto: QuerySupplierDto) {
    return this.service.findAll(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Profile of the signed-in supplier account' })
  myProfile(@CurrentUser() user: AuthUser) {
    return this.service.myProfile(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the signed-in supplier profile' })
  updateMine(
    @Body() dto: UpdateSupplierProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(user.supplierId ?? '', dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.SUPPLIER_APPROVE)
  @ApiOperation({ summary: 'Approve a supplier so it can join RFQs' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.approve(id, user);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.SUPPLIER_APPROVE)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reject(id, dto, user);
  }
}
