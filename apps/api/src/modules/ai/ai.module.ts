import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AiService } from './ai.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiAssistantService],
  exports: [AiService],
})
export class AiModule {}
