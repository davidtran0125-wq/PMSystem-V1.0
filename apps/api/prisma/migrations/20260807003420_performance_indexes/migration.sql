-- CreateIndex
CREATE INDEX "attachments_contractId_idx" ON "attachments"("contractId");

-- CreateIndex
CREATE INDEX "attachments_certificateId_idx" ON "attachments"("certificateId");

-- CreateIndex
CREATE INDEX "attachments_purchaseOrderId_idx" ON "attachments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_materialId_idx" ON "purchase_order_items"("materialId");

-- CreateIndex
CREATE INDEX "purchase_orders_currentStepId_idx" ON "purchase_orders"("currentStepId");

-- CreateIndex
CREATE INDEX "purchase_request_items_materialId_idx" ON "purchase_request_items"("materialId");

-- CreateIndex
CREATE INDEX "quotation_items_materialId_idx" ON "quotation_items"("materialId");
