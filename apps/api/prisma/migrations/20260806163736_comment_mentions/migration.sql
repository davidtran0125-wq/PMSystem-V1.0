-- CreateTable
CREATE TABLE "comment_mentions" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comment_mentions_userId_readAt_idx" ON "comment_mentions"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "comment_mentions_commentId_userId_key" ON "comment_mentions"("commentId", "userId");

-- AddForeignKey
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
