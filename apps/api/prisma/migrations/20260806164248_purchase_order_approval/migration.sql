-- CreateEnum
CREATE TYPE "ApprovalTarget" AS ENUM ('PURCHASE_REQUEST', 'PURCHASE_ORDER');

-- AlterTable
ALTER TABLE "approval_histories" ADD COLUMN     "purchaseOrderId" TEXT,
ALTER COLUMN "purchaseRequestId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "approval_workflows" ADD COLUMN     "appliesTo" "ApprovalTarget" NOT NULL DEFAULT 'PURCHASE_REQUEST';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "approvalWorkflowId" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "currentStepId" TEXT,
ADD COLUMN     "submittedForApprovalAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "approval_histories_purchaseOrderId_idx" ON "approval_histories"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "approval_histories" ADD CONSTRAINT "approval_histories_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvalWorkflowId_fkey" FOREIGN KEY ("approvalWorkflowId") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "approval_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
