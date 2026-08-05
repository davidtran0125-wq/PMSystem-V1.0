import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CommentsService } from './comments.service';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ description: 'Visible to buyers only' })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('purchase-requests/:id/comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PR_READ)
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.list(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PR_READ)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(id, dto.body, dto.isInternal ?? false, user);
  }
}
