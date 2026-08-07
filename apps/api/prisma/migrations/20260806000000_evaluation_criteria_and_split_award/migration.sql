-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "isAwarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "supplier_performances" ALTER COLUMN "priceScore" DROP NOT NULL,
ALTER COLUMN "qualityScore" DROP NOT NULL,
ALTER COLUMN "deliveryScore" DROP NOT NULL,
ALTER COLUMN "responseScore" DROP NOT NULL,
ALTER COLUMN "cooperationScore" DROP NOT NULL;

-- AlterTable
ALTER TABLE "supplier_quotations" ADD COLUMN     "awardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 5,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_performance_scores" (
    "id" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "criteriaId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,

CONSTRAINT "supplier_performance_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_performance_scores_performanceId_idx" ON "supplier_performance_scores"("performanceId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_performance_scores_performanceId_criteriaId_key" ON "supplier_performance_scores"("performanceId", "criteriaId");

-- AddForeignKey
ALTER TABLE "supplier_performance_scores" ADD CONSTRAINT "supplier_performance_scores_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "supplier_performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_performance_scores" ADD CONSTRAINT "supplier_performance_scores_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "evaluation_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chuyển dữ liệu trao thầu cũ (mỗi RFQ một NCC) sang mô hình mới
-- (nhiều NCC, đánh dấu theo từng dòng hàng) TRƯỚC khi xóa cột cũ.
UPDATE "supplier_quotations" q
SET "awardedAt" = r."awardedAt"
FROM "rfqs" r
WHERE r."awardedQuotationId" = q."id";

UPDATE "quotation_items" i
SET "isAwarded" = true
FROM "rfqs" r
WHERE r."awardedQuotationId" = i."quotationId";

-- DropForeignKey
ALTER TABLE "rfqs" DROP CONSTRAINT "rfqs_awardedQuotationId_fkey";

-- DropIndex
DROP INDEX "rfqs_awardedQuotationId_key";

-- AlterTable
ALTER TABLE "rfqs" DROP COLUMN "awardedQuotationId";
