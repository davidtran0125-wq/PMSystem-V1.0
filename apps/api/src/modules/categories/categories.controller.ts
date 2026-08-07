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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  QueryCategoryDto,
  UpdateCategoryDto,
  UpsertDynamicFormDto,
} from './dto/category.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  @ApiOperation({ summary: 'List purchasing categories' })
  findAll(@Query() dto: QueryCategoryDto) {
    return this.categoriesService.findAll(dto, dto.activeOnly ?? false);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Get(':id/form')
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  @ApiOperation({ summary: 'Active dynamic form for this category' })
  activeForm(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.activeForm(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  create(@Body() dto: CreateCategoryDto, @CurrentUser('id') userId: string) {
    return this.categoriesService.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.categoriesService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.categoriesService.remove(id, userId);
  }

  @Post(':id/form')
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  @ApiOperation({ summary: 'Publish a new version of the category form' })
  upsertForm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertDynamicFormDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.categoriesService.upsertForm(id, dto, userId);
  }

  @Get(':id/forms')
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  @ApiOperation({ summary: 'All form versions of this category' })
  formVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.formVersions(id);
  }

  @Delete(':id/forms/:formId')
  @RequirePermissions(PERMISSIONS.CATEGORY_WRITE)
  @ApiOperation({ summary: 'Delete a form version that is no longer needed' })
  removeForm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.categoriesService.removeForm(id, formId, userId);
  }
}
