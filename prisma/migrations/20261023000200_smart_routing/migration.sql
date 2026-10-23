-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "contractType" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "upn" TEXT NOT NULL,
    "postalCodes" JSONB NOT NULL DEFAULT [],
    "pestTypes" JSONB NOT NULL DEFAULT [],
    "directPhone" TEXT NOT NULL DEFAULT '',
    "availability" TEXT NOT NULL DEFAULT 'OFFLINE',
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "CallTicket" (
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
    "processingUntil" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallTicket_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlotOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SlotOffer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SlotOffer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutlookArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "start" DATETIME,
    "end" DATETIME,
    "remoteId" TEXT,
    "isMock" BOOLEAN NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutlookArtifact_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutlookArtifact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_mode_phone_key" ON "Customer"("mode", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CallTicket_mode_provider_externalId_key" ON "CallTicket"("mode", "provider", "externalId");

-- CreateIndex
CREATE INDEX "SlotOffer_employeeId_start_idx" ON "SlotOffer"("employeeId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "OutlookArtifact_ticketId_kind_key" ON "OutlookArtifact"("ticketId", "kind");

