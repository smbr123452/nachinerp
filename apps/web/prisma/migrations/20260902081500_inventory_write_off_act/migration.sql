-- Актаар хасалт (InventoryWriteOff). Зөвхөн НЭМЭХ шинжтэй өөрчлөлт:
-- одоо байгаа хүснэгт, дэвтрийн бичлэг, түүхэн өгөгдөл хөндөгдөхгүй.

-- 1) Хөдөлгөөний шинэ төрлүүд. Байгаа утгуудыг хэвээр үлдээнэ.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'WRITE_OFF_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'WRITE_OFF_REVERSAL_IN';

-- 2) Актын шалтгаан.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WriteOffReason') THEN
    CREATE TYPE "WriteOffReason" AS ENUM (
      'EXPIRED', 'SPOILED', 'DAMAGED', 'SPILLED_BROKEN',
      'LOSS', 'INTERNAL_USE', 'QUALITY_REJECTED', 'OTHER'
    );
  END IF;
END
$$;

-- 3) Актын толгой.
CREATE TABLE "InventoryWriteOff" (
  "id"             TEXT NOT NULL,
  "documentNo"     TEXT NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "reason"         "WriteOffReason" NOT NULL,
  "note"           TEXT,
  "status"         "DocStatus" NOT NULL DEFAULT 'DRAFT',
  "totalQuantity"  DECIMAL(18,3) NOT NULL DEFAULT 0,
  "totalCost"      DECIMAL(18,2) NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "postedAt"       TIMESTAMP(3),
  "postedById"     TEXT,
  "reversedAt"     TIMESTAMP(3),
  "reversedById"   TEXT,
  "reversalNote"   TEXT,
  CONSTRAINT "InventoryWriteOff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryWriteOff_documentNo_key" ON "InventoryWriteOff"("documentNo");
CREATE UNIQUE INDEX "InventoryWriteOff_idempotencyKey_key" ON "InventoryWriteOff"("idempotencyKey");
CREATE INDEX "InventoryWriteOff_date_idx" ON "InventoryWriteOff"("date");
CREATE INDEX "InventoryWriteOff_status_date_idx" ON "InventoryWriteOff"("status", "date");
CREATE INDEX "InventoryWriteOff_reason_status_idx" ON "InventoryWriteOff"("reason", "status");

ALTER TABLE "InventoryWriteOff"
  ADD CONSTRAINT "InventoryWriteOff_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryWriteOff"
  ADD CONSTRAINT "InventoryWriteOff_postedById_fkey"
  FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryWriteOff"
  ADD CONSTRAINT "InventoryWriteOff_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Актын мөр.
CREATE TABLE "InventoryWriteOffItem" (
  "id"                 TEXT NOT NULL,
  "writeOffId"         TEXT NOT NULL,
  "rawMaterialId"      TEXT,
  "productId"          TEXT,
  "quantity"           DECIMAL(18,3) NOT NULL,
  "unit"               "Unit" NOT NULL,
  "frozenUnitCost"     DECIMAL(18,4) NOT NULL DEFAULT 0,
  "totalCost"          DECIMAL(18,2) NOT NULL DEFAULT 0,
  "note"               TEXT,
  "movementId"         TEXT,
  "reversalMovementId" TEXT,
  CONSTRAINT "InventoryWriteOffItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryWriteOffItem_movementId_key" ON "InventoryWriteOffItem"("movementId");
CREATE UNIQUE INDEX "InventoryWriteOffItem_reversalMovementId_key" ON "InventoryWriteOffItem"("reversalMovementId");
CREATE INDEX "InventoryWriteOffItem_writeOffId_idx" ON "InventoryWriteOffItem"("writeOffId");
CREATE INDEX "InventoryWriteOffItem_rawMaterialId_idx" ON "InventoryWriteOffItem"("rawMaterialId");
CREATE INDEX "InventoryWriteOffItem_productId_idx" ON "InventoryWriteOffItem"("productId");

ALTER TABLE "InventoryWriteOffItem"
  ADD CONSTRAINT "InventoryWriteOffItem_writeOffId_fkey"
  FOREIGN KEY ("writeOffId") REFERENCES "InventoryWriteOff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryWriteOffItem"
  ADD CONSTRAINT "InventoryWriteOffItem_rawMaterialId_fkey"
  FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryWriteOffItem"
  ADD CONSTRAINT "InventoryWriteOffItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Мөр бүр ЯГ НЭГ нөөцийн субьекттэй — дэвтэр, худалдан авалтын мөртэй
--    ижил хамгаалалт. Prisma-аар илэрхийлэх боломжгүй тул гараар.
ALTER TABLE "InventoryWriteOffItem"
  ADD CONSTRAINT "write_off_item_single_subject"
  CHECK (("rawMaterialId" IS NOT NULL)::int + ("productId" IS NOT NULL)::int = 1);

-- 6) Тоо хэмжээ заавал эерэг — тэг ба сөрөг мөр өгөгдлийн санд орохгүй.
ALTER TABLE "InventoryWriteOffItem"
  ADD CONSTRAINT "write_off_item_positive_quantity"
  CHECK ("quantity" > 0);

-- 7) Баримтын дугаарлалт. MAX()+1 ашиглахгүй — зэрэгцээ хүсэлтэд аюултай.
CREATE SEQUENCE IF NOT EXISTS write_off_no_seq START 1;
