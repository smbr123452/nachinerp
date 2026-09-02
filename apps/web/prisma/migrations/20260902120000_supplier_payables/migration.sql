-- Нийлүүлэгчийн өглөг (accounts payable). Зөвхөн НЭМЭХ шинжтэй өөрчлөлт:
-- одоо байгаа худалдан авалт, нөөцийн дэвтэр, мөнгөн гүйлгээ, түүхэн
-- өгөгдөл ямар ч байдлаар өөрчлөгдөхгүй.
--
-- ЧУХАЛ: өмнө нь бүртгэгдсэн ЗЭЭЛЭЭР худалдан авалтууд өглөг үүсгэхгүй.
-- Тэдгээр нь түүхэн бичлэг хэвээр үлдэнэ. Хуучин өрийг таамаглан үүсгэвэл
-- бодит бус өр гарч ирэх тул энэ нүүлгэлт ЯМАР Ч мөр бөглөхгүй.

-- 1) Мөнгөн гүйлгээний шинэ төрлүүд.
ALTER TYPE "MoneyTransactionType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_OUT';
ALTER TYPE "MoneyTransactionType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_REVERSAL_IN';

-- 2) Өглөгийн толгой. Худалдан авалт бүрд хамгийн ихдээ нэг.
CREATE TABLE "SupplierPayable" (
  "id"             TEXT NOT NULL,
  "purchaseId"     TEXT NOT NULL,
  "supplierId"     TEXT NOT NULL,
  "originalAmount" DECIMAL(18,2) NOT NULL,
  "dueDate"        TIMESTAMP(3),
  "note"           TEXT,
  "status"         "DocStatus" NOT NULL DEFAULT 'POSTED',
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "cancelledAt"    TIMESTAMP(3),
  CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierPayable_purchaseId_key" ON "SupplierPayable"("purchaseId");
CREATE INDEX "SupplierPayable_supplierId_status_idx" ON "SupplierPayable"("supplierId", "status");
CREATE INDEX "SupplierPayable_status_dueDate_idx" ON "SupplierPayable"("status", "dueDate");

ALTER TABLE "SupplierPayable"
  ADD CONSTRAINT "SupplierPayable_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable"
  ADD CONSTRAINT "SupplierPayable_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable"
  ADD CONSTRAINT "SupplierPayable_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Өглөгийн дүн сөрөг байж болохгүй.
ALTER TABLE "SupplierPayable"
  ADD CONSTRAINT "supplier_payable_amount_non_negative"
  CHECK ("originalAmount" >= 0);

-- 3) Төлбөр. Нэг төлбөр нэг өглөгийг барагдуулна.
CREATE TABLE "SupplierPayment" (
  "id"             TEXT NOT NULL,
  "payableId"      TEXT NOT NULL,
  "amount"         DECIMAL(18,2) NOT NULL,
  "account"        "Account" NOT NULL,
  "paidAt"         TIMESTAMP(3) NOT NULL,
  "note"           TEXT,
  "reference"      TEXT,
  "status"         "DocStatus" NOT NULL DEFAULT 'POSTED',
  "idempotencyKey" TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt"     TIMESTAMP(3),
  "reversedById"   TEXT,
  "reversalNote"   TEXT,
  CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierPayment_idempotencyKey_key" ON "SupplierPayment"("idempotencyKey");
CREATE INDEX "SupplierPayment_payableId_status_idx" ON "SupplierPayment"("payableId", "status");
CREATE INDEX "SupplierPayment_paidAt_idx" ON "SupplierPayment"("paidAt");

ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_payableId_fkey"
  FOREIGN KEY ("payableId") REFERENCES "SupplierPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_reversedById_fkey"
  FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Төлбөр заавал эерэг — тэг ба сөрөг төлбөр өгөгдлийн санд орохгүй.
ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "supplier_payment_positive_amount"
  CHECK ("amount" > 0);
