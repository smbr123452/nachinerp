-- CreateEnum
CREATE TYPE "DeliveryRunStatus" AS ENUM ('DRAFT', 'LOADED', 'IN_PROGRESS', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockTxnType" ADD VALUE 'ROUTE_LOAD_OUT';
ALTER TYPE "StockTxnType" ADD VALUE 'ROUTE_RETURN_IN';

-- CreateTable
CREATE TABLE "DeliveryRoute" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameMn" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRouteStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,

    CONSTRAINT "DeliveryRouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRun" (
    "id" TEXT NOT NULL,
    "runNo" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "status" "DeliveryRunStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "loadedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "loadedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "deliveredQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "returnedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "lossQty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryConfirmation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "DeliveryConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryConfirmationItem" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "DeliveryConfirmationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRoute_code_key" ON "DeliveryRoute"("code");

-- CreateIndex
CREATE INDEX "DeliveryRoute_isActive_idx" ON "DeliveryRoute"("isActive");

-- CreateIndex
CREATE INDEX "DeliveryRouteStop_routeId_stopOrder_idx" ON "DeliveryRouteStop"("routeId", "stopOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRouteStop_routeId_branchId_key" ON "DeliveryRouteStop"("routeId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRun_runNo_key" ON "DeliveryRun"("runNo");

-- CreateIndex
CREATE INDEX "DeliveryRun_status_runDate_idx" ON "DeliveryRun"("status", "runDate");

-- CreateIndex
CREATE INDEX "DeliveryRunItem_productId_idx" ON "DeliveryRunItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRunItem_runId_productId_key" ON "DeliveryRunItem"("runId", "productId");

-- CreateIndex
CREATE INDEX "DeliveryConfirmation_runId_confirmedAt_idx" ON "DeliveryConfirmation"("runId", "confirmedAt");

-- CreateIndex
CREATE INDEX "DeliveryConfirmationItem_confirmationId_idx" ON "DeliveryConfirmationItem"("confirmationId");

-- CreateIndex
CREATE INDEX "DeliveryConfirmationItem_productId_idx" ON "DeliveryConfirmationItem"("productId");

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRouteStop" ADD CONSTRAINT "DeliveryRouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRouteStop" ADD CONSTRAINT "DeliveryRouteStop_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRunItem" ADD CONSTRAINT "DeliveryRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeliveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRunItem" ADD CONSTRAINT "DeliveryRunItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeliveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmationItem" ADD CONSTRAINT "DeliveryConfirmationItem_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "DeliveryConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmationItem" ADD CONSTRAINT "DeliveryConfirmationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
