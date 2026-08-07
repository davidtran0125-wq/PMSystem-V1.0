import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({
    type: [String],
    description: 'Người được nhắc tên trong nội dung, sẽ nhận thông báo riêng',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  mentionUserIds?: string[];
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

  @Get('mentionable-users')
  @RequirePermissions(PERMISSIONS.PR_READ)
  @ApiOperation({
    summary:
      'Những người có thể nhắc tên trong yêu cầu này, dùng cho gợi ý khi gõ @',
  })
  mentionable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
  ) {
    return this.service.mentionableUsers(id, user, search);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PR_READ)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(id, dto, user);
  }
}
