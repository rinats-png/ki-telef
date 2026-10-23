-- CreateTable
CREATE TABLE "TelephonyCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrier" TEXT NOT NULL DEFAULT 'twilio',
    "carrierCallId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REGISTERING',
    "bridgeUri" TEXT,
    "registeringUntil" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSeconds" INTEGER,
    CONSTRAINT "TelephonyCall_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telephonyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCallId" TEXT NOT NULL,
    "finalStatus" TEXT,
    "endedAt" DATETIME,
    CONSTRAINT "VoiceLeg_telephonyId_fkey" FOREIGN KEY ("telephonyId") REFERENCES "TelephonyCall" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telephonyId" TEXT NOT NULL,
    "technicianPhone" TEXT NOT NULL,
    "technicianCallSid" TEXT,
    "conferenceSid" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PREPARING',
    "reason" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransferJob_telephonyId_fkey" FOREIGN KEY ("telephonyId") REFERENCES "TelephonyCall" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CallTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" TEXT,
    "assignedEmployeeId" TEXT,
    "callerPhone" TEXT NOT NULL DEFAULT '',
    "customerKind" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "category" TEXT NOT NULL DEFAULT 'NEW_INQUIRY',
    "pestType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "urgency" TEXT NOT NULL DEFAULT 'LOW',
    "summary" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "routingReason" TEXT NOT NULL DEFAULT '',
    "routeAction" TEXT NOT NULL DEFAULT 'CALLBACK',
    "status" TEXT NOT NULL DEFAULT 'IDENTIFYING',
    "outlookEventId" TEXT,
    "outlookDraftId" TEXT,
    "recordingUrl" TEXT,
    "durationSeconds" INTEGER,
    "callStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "transcriptRank" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "finalizationHash" TEXT,
    "processingUntil" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallTicket_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CallTicket" ("assignedEmployeeId", "callerPhone", "category", "createdAt", "customerId", "customerKind", "externalId", "finalizationHash", "id", "lastError", "mode", "outlookDraftId", "outlookEventId", "pestType", "processingUntil", "provider", "routeAction", "routingReason", "status", "summary", "transcript", "updatedAt", "urgency") SELECT "assignedEmployeeId", "callerPhone", "category", "createdAt", "customerId", "customerKind", "externalId", "finalizationHash", "id", "lastError", "mode", "outlookDraftId", "outlookEventId", "pestType", "processingUntil", "provider", "routeAction", "routingReason", "status", "summary", "transcript", "updatedAt", "urgency" FROM "CallTicket";
DROP TABLE "CallTicket";
ALTER TABLE "new_CallTicket" RENAME TO "CallTicket";
CREATE UNIQUE INDEX "CallTicket_mode_provider_externalId_key" ON "CallTicket"("mode", "provider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyCall_carrierCallId_key" ON "TelephonyCall"("carrierCallId");

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyCall_ticketId_key" ON "TelephonyCall"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceLeg_provider_providerCallId_key" ON "VoiceLeg"("provider", "providerCallId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferJob_telephonyId_key" ON "TransferJob"("telephonyId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferJob_technicianCallSid_key" ON "TransferJob"("technicianCallSid");

-- CreateIndex
CREATE UNIQUE INDEX "CallActivity_dedupeKey_key" ON "CallActivity"("dedupeKey");

