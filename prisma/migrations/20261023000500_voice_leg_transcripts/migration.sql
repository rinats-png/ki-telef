-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VoiceLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telephonyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCallId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '',
    "transcriptRank" INTEGER NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalStatus" TEXT,
    "endedAt" DATETIME,
    CONSTRAINT "VoiceLeg_telephonyId_fkey" FOREIGN KEY ("telephonyId") REFERENCES "TelephonyCall" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VoiceLeg" ("endedAt", "finalStatus", "id", "provider", "providerCallId", "telephonyId") SELECT "endedAt", "finalStatus", "id", "provider", "providerCallId", "telephonyId" FROM "VoiceLeg";
DROP TABLE "VoiceLeg";
ALTER TABLE "new_VoiceLeg" RENAME TO "VoiceLeg";
CREATE UNIQUE INDEX "VoiceLeg_provider_providerCallId_key" ON "VoiceLeg"("provider", "providerCallId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

