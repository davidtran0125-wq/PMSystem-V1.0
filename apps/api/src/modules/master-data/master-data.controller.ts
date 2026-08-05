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
import { MasterDataService } from './master-data.service';
import {
  CreateDepartmentDto,
  CreateProjectDto,
  QueryUsersDto,
  UpdateUserRolesDto,
} from './dto/master-data.dto';
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

  @Get('users')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'List internal users' })
  users(@Query() dto: QueryUsersDto) {
    return this.service.users(dto);
  }

  @Patch('users/:id/roles')
  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @ApiOperation({ summary: 'Replace the roles assigned to a user' })
  updateUserRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateUserRoles(id, dto, userId);
  }
}
