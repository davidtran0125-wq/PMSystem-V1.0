import { Module } from '@nestjs/common';
import { ApprovalRoutingService } from './approval-routing.service';
import { ApprovalWorkflowsController } from './approval-workflows.controller';
import { ApprovalWorkflowsService } from './approval-workflows.service';

@Module({
  controllers: [ApprovalWorkflowsController],
  providers: [ApprovalRoutingService, ApprovalWorkflowsService],
  exports: [ApprovalRoutingService],
})
export class ApprovalsModule {}
