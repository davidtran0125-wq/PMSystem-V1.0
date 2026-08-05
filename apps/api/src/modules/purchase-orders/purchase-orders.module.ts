import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CodeGeneratorService } from '../../common/code-generator.service';

@Module({
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, CodeGeneratorService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
