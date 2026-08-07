-- CreateIndex
CREATE INDEX "purchase_requests_deletedAt_createdAt_idx" ON "purchase_requests"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_requests_deletedAt_status_createdAt_idx" ON "purchase_requests"("deletedAt", "status", "createdAt");
