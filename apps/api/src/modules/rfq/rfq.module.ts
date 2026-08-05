import { Module } from '@nestjs/common';
import { RfqController } from './rfq.controller';
import { RfqService } from './rfq.service';
import { CodeGeneratorService } from '../../common/code-generator.service';

@Module({
  controllers: [RfqController],
  providers: [RfqService, CodeGeneratorService],
  exports: [RfqService],
})
export class RfqModule {}
