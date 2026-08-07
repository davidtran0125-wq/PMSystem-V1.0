import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderPdfService } from './purchase-order-pdf.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { SettingsModule } from '../settings/settings.module';
import { ApprovalRoutingService } from '../approvals/approval-routing.service';

@Module({
  imports: [SettingsModule],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchaseOrdersService,
    PurchaseOrderPdfService,
    CodeGeneratorService,
    ApprovalRoutingService,
  ],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
