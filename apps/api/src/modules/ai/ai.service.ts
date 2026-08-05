import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type * as z from 'zod/v4';

/**
 * Claude Opus 5 — the current flagship. Adaptive thinking is on by default on
 * this model, so the `thinking` parameter is left unset.
 */
const MODEL = 'claude-opus-5';

export interface AskOptions {
  /** Stable instructions; cached so repeated calls only pay for the variable part. */
  system: string;
  /** The variable part of the prompt. */
  prompt: string;
  /** Documents (PDFs) to attach before the text, e.g. a scanned quotation. */
  documents?: { base64: string; mediaType: string }[];
  /** Trades thoroughness against latency and cost. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens?: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  /** False when no API key is configured, so callers can hide AI features. */
  get isEnabled(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  /**
   * Runs a prompt and validates the reply against `schema`. Structured outputs
   * constrain the model to the schema, so callers get typed data rather than
   * prose they would have to parse.
   */
  async ask<T extends z.ZodType>(
    schema: T,
    options: AskOptions,
  ): Promise<z.infer<T>> {
    const client = this.getClient();

    const content: Anthropic.ContentBlockParam[] = [
      ...(options.documents ?? []).map(
        (doc): Anthropic.ContentBlockParam => ({
          type: 'document',
          source: {
            type: 'base64',
            media_type: doc.mediaType as 'application/pdf',
            data: doc.base64,
          },
        }),
      ),
      { type: 'text', text: options.prompt },
    ];

    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: options.maxTokens ?? 16000,
        output_config: {
          effort: options.effort ?? 'high',
          format: zodOutputFormat(schema),
        },
        system: [
          {
            type: 'text',
            text: options.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content }],
      });

      // Safety classifiers can decline a request; content is empty or partial.
      if (response.stop_reason === 'refusal') {
        throw new ServiceUnavailableException(
          'Trợ lý AI từ chối xử lý nội dung này. Vui lòng kiểm tra lại dữ liệu đầu vào.',
        );
      }
      if (response.stop_reason === 'max_tokens') {
        throw new ServiceUnavailableException(
          'Nội dung quá dài để phân tích trong một lần. Hãy thử với dữ liệu nhỏ hơn.',
        );
      }
      if (!response.parsed_output) {
        throw new ServiceUnavailableException(
          'Trợ lý AI trả về dữ liệu không đúng định dạng mong đợi.',
        );
      }

      return response.parsed_output;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;

      if (error instanceof Anthropic.AuthenticationError) {
        throw new ServiceUnavailableException(
          'ANTHROPIC_API_KEY không hợp lệ. Kiểm tra lại cấu hình trong file .env.',
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException(
          'Đã vượt giới hạn gọi AI. Vui lòng thử lại sau ít phút.',
        );
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new ServiceUnavailableException(
          'Không kết nối được tới dịch vụ AI. Kiểm tra kết nối mạng.',
        );
      }

      this.logger.error(
        'Gọi AI thất bại',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException('Trợ lý AI đang gặp sự cố.');
    }
  }

  private getClient(): Anthropic {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Tính năng AI chưa được bật. Thêm ANTHROPIC_API_KEY vào apps/api/.env rồi khởi động lại API.',
      );
    }
    this.client ??= new Anthropic({ apiKey });
    return this.client;
  }
}
