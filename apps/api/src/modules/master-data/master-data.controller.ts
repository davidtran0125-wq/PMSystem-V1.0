import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MasterDataService } from './master-data.service';
import { CreateDepartmentDto, CreateProjectDto } from './dto/master-data.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Master data')
@ApiBearerAuth()
@Controller()
export class MasterDataController {
  constructor(private readonly service: MasterDataService) {}

  @Get('departments')
  @RequirePermissions(PERMISSIONS.DEPARTMENT_READ)
  departments(@Query() dto: PaginationDto) {
    return this.service.departments(dto);
  }

  @Post('departments')
  @RequirePermissions(PERMISSIONS.DEPARTMENT_WRITE)
  createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createDepartment(dto, userId);
  }

  @Get('projects')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  projects(@Query() dto: PaginationDto) {
    return this.service.projects(dto);
  }

  @Post('projects')
  @RequirePermissions(PERMISSIONS.PROJECT_WRITE)
  createProject(
    @Body() dto: CreateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createProject(dto, userId);
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  roles() {
    return this.service.roles();
  }
}
