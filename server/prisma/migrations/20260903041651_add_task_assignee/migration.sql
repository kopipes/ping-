-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "content" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneById" TEXT,
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("content", "conversationId", "createdAt", "createdById", "doneAt", "doneById", "id", "isDone", "messageId") SELECT "content", "conversationId", "createdAt", "createdById", "doneAt", "doneById", "id", "isDone", "messageId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_conversationId_isDone_idx" ON "Task"("conversationId", "isDone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
