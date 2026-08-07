-- CreateTable
CREATE TABLE "purchase_order_revisions" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changedById" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "note" TEXT,
    "previousStatus" "PurchaseOrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_order_revisions_purchaseOrderId_idx" ON "purchase_order_revisions"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_revisions_purchaseOrderId_version_key" ON "purchase_order_revisions"("purchaseOrderId", "version");

-- AddForeignKey
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
