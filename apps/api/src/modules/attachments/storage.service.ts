import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Files are addressed by an opaque storage key rather than by their original
 * name, so a hostile filename can never influence where bytes land on disk.
 * Only the local driver is implemented; the key layout is S3-compatible so
 * swapping in a bucket later does not change any caller.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(
      this.config.get<string>('LOCAL_STORAGE_PATH', './storage'),
    );
  }

  async save(
    folder: string,
    originalName: string,
    buffer: Buffer,
  ): Promise<string> {
    const extension = this.extensionOf(originalName);
    const key = `${folder}/${new Date().getFullYear()}/${randomUUID()}${extension}`;
    const target = this.pathFor(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return key;
  }

  stream(key: string) {
    const target = this.pathFor(key);
    if (!existsSync(target)) {
      throw new NotFoundException('Không tìm thấy file trên hệ thống lưu trữ');
    }
    return createReadStream(target);
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      // A missing file is not worth failing the request the caller is doing.
      this.logger.warn(
        `Không xóa được file ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves a key under the storage root and refuses anything that escapes it,
   * so a key containing `..` cannot reach the rest of the filesystem.
   */
  private pathFor(key: string): string {
    const target = resolve(join(this.root, key));
    if (target !== this.root && !target.startsWith(this.root + '/')) {
      throw new NotFoundException('Đường dẫn file không hợp lệ');
    }
    return target;
  }

  private extensionOf(name: string): string {
    const match = /\.[A-Za-z0-9]{1,10}$/.exec(name);
    return match ? match[0].toLowerCase() : '';
  }
}
