-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "ownerId" TEXT,
    "allowStaffPin" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPinnedTop" BOOLEAN NOT NULL DEFAULT false,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "allowGuestPost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("allowStaffPin", "createdAt", "description", "icon", "id", "isArchived", "isPinnedTop", "isPublic", "isReadOnly", "name", "ownerId", "parentId", "type") SELECT "allowStaffPin", "createdAt", "description", "icon", "id", "isArchived", "isPinnedTop", "isPublic", "isReadOnly", "name", "ownerId", "parentId", "type" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_type_idx" ON "Conversation"("type");
CREATE INDEX "Conversation_parentId_idx" ON "Conversation"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
