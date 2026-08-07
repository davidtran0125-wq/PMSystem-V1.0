import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AttachmentsService,
  type AttachmentTarget,
  type UploadedFile as MulterFile,
} from './attachments.service';
import type { AuthUser } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators';

const TARGETS: AttachmentTarget[] = [
  'CONTRACT',
  'CERTIFICATE',
  'PURCHASE_REQUEST',
  'PURCHASE_ORDER',
  'SUPPLIER',
  'RFQ',
  'QUOTATION',
];

function parseTarget(value: string): AttachmentTarget {
  const target = value?.toUpperCase() as AttachmentTarget;
  if (!TARGETS.includes(target)) {
    throw new BadRequestException(
      `target phải là một trong: ${TARGETS.join(', ')}`,
    );
  }
  return target;
}

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách tài liệu đính kèm của một đối tượng',
    description:
      'Quyền yêu cầu phụ thuộc loại đối tượng: hợp đồng cần contract:read, ' +
      'chứng chỉ cần certificate:read, … Nhà cung cấp chỉ thấy hồ sơ của mình.',
  })
  list(
    @Query('target') target: string,
    @Query('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.list(parseTarget(target), entityId, user);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        target: { type: 'string', example: 'CONTRACT' },
        entityId: { type: 'string', format: 'uuid' },
        documentType: { type: 'string', example: 'ISO' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Tải tài liệu lên. Trùng tên trên cùng đối tượng sẽ tạo phiên bản mới.',
    description: 'Cần quyền ghi của loại đối tượng, ví dụ contract:write.',
  })
  upload(
    @Query('target') targetQuery: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: MulterFile,
    @Query('entityId') entityId?: string,
    @Query('documentType') documentType?: string,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    if (!entityId) throw new BadRequestException('Thiếu entityId');
    return this.service.upload(
      parseTarget(targetQuery),
      entityId,
      file,
      documentType,
      user,
    );
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Tải tài liệu về' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { attachment, stream } = await this.service.download(id, user);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', attachment.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    stream.pipe(res);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa tài liệu. Cần quyền ghi của loại đối tượng.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user);
  }
}
