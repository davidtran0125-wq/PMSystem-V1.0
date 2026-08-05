import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({ summary: 'Buyer workload and expiry counters' })
  overview() {
    return this.service.buyerOverview();
  }

  @Get('spend')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({ summary: 'Spend split by category and department' })
  spend(
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ) {
    return this.service.spendByCategory(months ?? 12);
  }

  @Get('savings')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  savings(
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ) {
    return this.service.savings(months ?? 12);
  }

  @Get('top-suppliers')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  topSuppliers(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.service.topSuppliers(limit ?? 10);
  }

  @Get('sla')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({ summary: 'Time from submission to buyer decision' })
  sla() {
    return this.service.slaMetrics();
  }
}
