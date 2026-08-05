import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { AiAssistantService } from './ai-assistant.service';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

@ApiTags('AI Assistant')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly service: AiAssistantService) {}

  @Get('status')
  @ApiOperation({ summary: 'Trợ lý AI đã được bật chưa' })
  status() {
    return this.service.status();
  }

  @Post('purchase-requests/:id/analyze')
  @RequirePermissions(PERMISSIONS.AI_USE)
  @ApiOperation({
    summary: 'Rà soát yêu cầu mua hàng: thiếu sót, rủi ro, câu hỏi cần làm rõ',
  })
  analyzePurchaseRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.analyzePurchaseRequest(id, userId);
  }

  @Post('purchase-requests/:id/suggest-suppliers')
  @RequirePermissions(PERMISSIONS.AI_USE)
  @ApiOperation({ summary: 'Gợi ý nhà cung cấp phù hợp để mời báo giá' })
  suggestSuppliers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.suggestSuppliers(id, userId);
  }

  @Post('rfqs/:id/analyze-quotations')
  @RequirePermissions(PERMISSIONS.AI_USE)
  @ApiOperation({
    summary: 'So sánh báo giá và khuyến nghị lựa chọn theo tổng chi phí sở hữu',
  })
  analyzeQuotations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.analyzeQuotations(id, userId);
  }

  @Post('contracts/:id/review')
  @RequirePermissions(PERMISSIONS.AI_USE)
  @ApiOperation({ summary: 'Rà soát rủi ro hợp đồng cho bên mua' })
  reviewContract(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.reviewContract(id, userId);
  }

  @Post('quotations/extract')
  @RequirePermissions(PERMISSIONS.AI_USE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Đọc báo giá PDF và trích xuất thành dữ liệu có cấu trúc' })
  extractQuotation(
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file PDF');
    return this.service.extractQuotation(file);
  }
}
