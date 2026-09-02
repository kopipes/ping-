-- CreateIndex
CREATE INDEX "Message_conversationId_isDeleted_idx" ON "Message"("conversationId", "isDeleted");

-- CreateIndex
CREATE INDEX "Message_userId_conversationId_idx" ON "Message"("userId", "conversationId");
