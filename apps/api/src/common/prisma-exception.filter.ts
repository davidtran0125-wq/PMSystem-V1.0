import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Dịch lỗi ràng buộc của Prisma thành mã HTTP đúng nghĩa.
 *
 * Không có bộ lọc này, một bản ghi trùng khóa duy nhất trả về **500** kèm
 * nguyên vết ngăn xếp của Prisma: người dùng chỉ thấy "lỗi hệ thống" cho một
 * việc hoàn toàn bình thường là nhập trùng mã, còn log thì đầy báo động giả.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = this.translate(error);
    if (!mapped) return super.catch(error, host);

    const response = host.switchToHttp().getResponse<Response>();
    this.logger.warn(`${error.code}: ${mapped.message}`);
    response.status(mapped.getStatus()).json(mapped.getResponse());
  }

  private translate(
    error: Prisma.PrismaClientKnownRequestError,
  ): HttpException | null {
    switch (error.code) {
      case 'P2002': {
        const fields = this.fieldsOf(error);
        return new ConflictException(
          fields.length
            ? `Giá trị đã tồn tại ở: ${fields.join(', ')}`
            : 'Giá trị này đã tồn tại trong hệ thống',
        );
      }
      case 'P2025':
        return new NotFoundException('Không tìm thấy bản ghi cần thao tác');
      case 'P2003':
        return new ConflictException(
          'Bản ghi đang được tham chiếu ở nơi khác nên không thao tác được',
        );
      default:
        return null;
    }
  }

  private fieldsOf(error: Prisma.PrismaClientKnownRequestError): string[] {
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
  }
}
