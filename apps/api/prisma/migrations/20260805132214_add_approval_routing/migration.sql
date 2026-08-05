-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN     "approvalWorkflowId" TEXT,
ADD COLUMN     "currentStepId" TEXT;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approvalWorkflowId_fkey" FOREIGN KEY ("approvalWorkflowId") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "approval_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
