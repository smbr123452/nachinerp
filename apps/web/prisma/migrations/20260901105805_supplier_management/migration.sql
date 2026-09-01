-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "SupplierItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rawMaterialId" TEXT,
    "productId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierItem_supplierId_idx" ON "SupplierItem"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierItem_rawMaterialId_idx" ON "SupplierItem"("rawMaterialId");

-- CreateIndex
CREATE INDEX "SupplierItem_productId_idx" ON "SupplierItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_supplierId_rawMaterialId_key" ON "SupplierItem"("supplierId", "rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_supplierId_productId_key" ON "SupplierItem"("supplierId", "productId");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Доорх нь Prisma-аар илэрхийлэх боломжгүй хязгаарлалтууд. Бүгд НЭМЭЛТ
-- үйлдэл — түүхэн мөр устгахгүй, дарж бичихгүй.
-- ---------------------------------------------------------------------------

-- 1) Нийлүүлэгчийн барааны мөр яг НЭГ субьекттэй байна.
--    (InventoryMovement / PurchaseItem дээрхтэй ижил загвар.)
ALTER TABLE "SupplierItem"
  ADD CONSTRAINT "SupplierItem_subject_exactly_one"
  CHECK (("rawMaterialId" IS NOT NULL)::int + ("productId" IS NOT NULL)::int = 1);

-- 2) Нийлүүлэгчийн нэр том/жижиг үсэг, захын хоосон зайнаас үл хамааран
--    давхардахгүй: "Алтан Тариа" ба "алтан тариа " хоёр нэг гэж тооцогдоно.
--    Одоо байгаа өгөгдөлд ийм давхардал байхгүйг шалгасан.
CREATE UNIQUE INDEX "Supplier_name_normalized_key" ON "Supplier" (lower(btrim("name")));
