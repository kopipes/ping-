-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PinnedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "note" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'group',
    "pinnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PinnedItem_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PinnedItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PinnedItem_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PinnedItem" ("conversationId", "id", "messageId", "note", "pinnedAt", "pinnedById") SELECT "conversationId", "id", "messageId", "note", "pinnedAt", "pinnedById" FROM "PinnedItem";
DROP TABLE "PinnedItem";
ALTER TABLE "new_PinnedItem" RENAME TO "PinnedItem";
CREATE UNIQUE INDEX "PinnedItem_conversationId_messageId_pinnedById_scope_key" ON "PinnedItem"("conversationId", "messageId", "pinnedById", "scope");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
