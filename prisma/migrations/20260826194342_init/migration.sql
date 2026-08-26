-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateEnum
CREATE TYPE "TipKind" AS ENUM ('WATER', 'RESCUE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "gustoEmployeeId" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "rateScheduleId" TEXT,
    "lockedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayRecord" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "rentalCount" INTEGER,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "reviewCount" INTEGER,
    "ebikeCount" INTEGER,
    "closerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftEntry" (
    "id" TEXT NOT NULL,
    "dayRecordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualTip" (
    "id" TEXT NOT NULL,
    "dayRecordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" "TipKind" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateSchedule" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "rescueDefaultCents" INTEGER NOT NULL DEFAULT 2500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalTier" (
    "id" TEXT NOT NULL,
    "rateScheduleId" TEXT NOT NULL,
    "minRentals" INTEGER NOT NULL,
    "bonusCents" INTEGER NOT NULL,

    CONSTRAINT "RentalTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTier" (
    "id" TEXT NOT NULL,
    "rateScheduleId" TEXT NOT NULL,
    "minReviews" INTEGER NOT NULL,
    "perReviewCents" INTEGER NOT NULL,

    CONSTRAINT "ReviewTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

-- CreateIndex
CREATE INDEX "PayPeriod_status_idx" ON "PayPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayPeriod_startDate_key" ON "PayPeriod"("startDate");

-- CreateIndex
CREATE INDEX "DayRecord_payPeriodId_idx" ON "DayRecord"("payPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "DayRecord_date_key" ON "DayRecord"("date");

-- CreateIndex
CREATE INDEX "ShiftEntry_userId_idx" ON "ShiftEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftEntry_dayRecordId_userId_key" ON "ShiftEntry"("dayRecordId", "userId");

-- CreateIndex
CREATE INDEX "IndividualTip_dayRecordId_idx" ON "IndividualTip"("dayRecordId");

-- CreateIndex
CREATE INDEX "IndividualTip_userId_idx" ON "IndividualTip"("userId");

-- CreateIndex
CREATE INDEX "RateSchedule_isCurrent_idx" ON "RateSchedule"("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "RentalTier_rateScheduleId_minRentals_key" ON "RentalTier"("rateScheduleId", "minRentals");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTier_rateScheduleId_minReviews_key" ON "ReviewTier"("rateScheduleId", "minReviews");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_rateScheduleId_fkey" FOREIGN KEY ("rateScheduleId") REFERENCES "RateSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayRecord" ADD CONSTRAINT "DayRecord_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayRecord" ADD CONSTRAINT "DayRecord_closerId_fkey" FOREIGN KEY ("closerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftEntry" ADD CONSTRAINT "ShiftEntry_dayRecordId_fkey" FOREIGN KEY ("dayRecordId") REFERENCES "DayRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftEntry" ADD CONSTRAINT "ShiftEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualTip" ADD CONSTRAINT "IndividualTip_dayRecordId_fkey" FOREIGN KEY ("dayRecordId") REFERENCES "DayRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualTip" ADD CONSTRAINT "IndividualTip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTier" ADD CONSTRAINT "RentalTier_rateScheduleId_fkey" FOREIGN KEY ("rateScheduleId") REFERENCES "RateSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTier" ADD CONSTRAINT "ReviewTier_rateScheduleId_fkey" FOREIGN KEY ("rateScheduleId") REFERENCES "RateSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
