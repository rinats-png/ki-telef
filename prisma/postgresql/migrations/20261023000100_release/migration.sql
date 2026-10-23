-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "transcript" TEXT NOT NULL DEFAULT '',
    "recordingUrl" TEXT,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technician" (
    "mode" TEXT NOT NULL DEFAULT 'live',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "pestType" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "duration" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "childrenOrPets" TEXT NOT NULL DEFAULT '',
    "serviceAreaStatus" TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "technicianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "result" TEXT NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "upn" TEXT NOT NULL,
    "postalCodes" JSONB NOT NULL DEFAULT '[]',
    "pestTypes" JSONB NOT NULL DEFAULT '[]',
    "directPhone" TEXT NOT NULL DEFAULT '',
    "availability" TEXT NOT NULL DEFAULT 'OFFLINE',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTicket" (
    "id" TEXT NOT NULL,
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
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "finalizationHash" TEXT,
    "processingUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotOffer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SlotOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutlookArtifact" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "remoteId" TEXT,
    "isMock" BOOLEAN NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutlookArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelephonyCall" (
    "id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'twilio',
    "carrierCallId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REGISTERING',
    "bridgeUri" TEXT,
    "registeringUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,

    CONSTRAINT "TelephonyCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceLeg" (
    "id" TEXT NOT NULL,
    "telephonyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCallId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL DEFAULT '',
    "transcriptRank" INTEGER NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalStatus" TEXT,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferJob" (
    "id" TEXT NOT NULL,
    "telephonyId" TEXT NOT NULL,
    "technicianPhone" TEXT NOT NULL,
    "technicianCallSid" TEXT,
    "conferenceSid" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PREPARING',
    "reason" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallActivity" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE INDEX "Call_mode_createdAt_idx" ON "Call"("mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_provider_externalId_mode_key" ON "Call"("provider", "externalId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_callId_key" ON "Lead"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_callId_key" ON "Escalation"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_callId_eventKey_key" ON "Receipt"("callId", "eventKey");

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

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTicket" ADD CONSTRAINT "CallTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTicket" ADD CONSTRAINT "CallTicket_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlookArtifact" ADD CONSTRAINT "OutlookArtifact_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlookArtifact" ADD CONSTRAINT "OutlookArtifact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelephonyCall" ADD CONSTRAINT "TelephonyCall_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceLeg" ADD CONSTRAINT "VoiceLeg_telephonyId_fkey" FOREIGN KEY ("telephonyId") REFERENCES "TelephonyCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferJob" ADD CONSTRAINT "TransferJob_telephonyId_fkey" FOREIGN KEY ("telephonyId") REFERENCES "TelephonyCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallActivity" ADD CONSTRAINT "CallActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CallTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

