import { Module } from '@nestjs/common';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { ApprovalRoutingService } from '../approvals/approval-routing.service';

@Module({
  controllers: [PurchaseRequestsController],
  providers: [
    PurchaseRequestsService,
    CodeGeneratorService,
    ApprovalRoutingService,
  ],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
