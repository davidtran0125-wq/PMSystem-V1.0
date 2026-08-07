-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MaterialChangeType" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "MaterialChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "materialId" TEXT;

-- AlterTable
ALTER TABLE "purchase_request_items" ADD COLUMN     "materialId" TEXT;

-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN     "materialId" TEXT;

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "specification" TEXT,
    "unit" TEXT NOT NULL,
    "categoryId" TEXT,
    "manufacturer" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "hsCode" TEXT,
    "standardPrice" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "minStock" DECIMAL(18,3),
    "status" "MaterialStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_change_requests" (
    "id" TEXT NOT NULL,
    "materialId" TEXT,
    "type" "MaterialChangeType" NOT NULL,
    "status" "MaterialChangeStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "snapshot" JSONB,
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE INDEX "materials_status_idx" ON "materials"("status");

-- CreateIndex
CREATE INDEX "materials_categoryId_idx" ON "materials"("categoryId");

-- CreateIndex
CREATE INDEX "material_change_requests_status_idx" ON "material_change_requests"("status");

-- CreateIndex
CREATE INDEX "material_change_requests_materialId_idx" ON "material_change_requests"("materialId");

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_change_requests" ADD CONSTRAINT "material_change_requests_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_change_requests" ADD CONSTRAINT "material_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_change_requests" ADD CONSTRAINT "material_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
