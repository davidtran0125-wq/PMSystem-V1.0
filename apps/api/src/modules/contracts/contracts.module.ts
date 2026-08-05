import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ExpiryService } from './expiry.service';

@Module({
  controllers: [ContractsController],
  providers: [ContractsService, ExpiryService],
  exports: [ExpiryService],
})
export class ContractsModule {}
