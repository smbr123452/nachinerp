-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('MANUFACTURED', 'RESALE');

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "rawMaterialId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "averageCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "lastPurchasePrice" DECIMAL(18,4),
ADD COLUMN     "minimumStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'MANUFACTURED',
ADD COLUMN     "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "unit" "Unit" NOT NULL DEFAULT 'PCS';

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "rawMaterialId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RawMaterialCategory" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PurchaseAttachment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseAttachment_storageKey_key" ON "PurchaseAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "PurchaseAttachment_purchaseId_idx" ON "PurchaseAttachment"("purchaseId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_productType_isActive_idx" ON "Product"("productType", "isActive");

-- CreateIndex
CREATE INDEX "ProductCategory_isActive_idx" ON "ProductCategory"("isActive");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_status_date_idx" ON "Purchase"("supplierId", "status", "date");

-- CreateIndex
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "RawMaterialCategory_isActive_idx" ON "RawMaterialCategory"("isActive");

-- AddForeignKey
ALTER TABLE "PurchaseAttachment" ADD CONSTRAINT "PurchaseAttachment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAttachment" ADD CONSTRAINT "PurchaseAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ГАРЫН АВЛАГА: доорх хэсэг нь Prisma-гийн үүсгэсэн SQL дээр НЭМЭЛТ.
-- Prisma-аар илэрхийлэх боломжгүй CHECK хязгаарлалт ба дугаарлалтын sequence.
-- Бүгд нэмэлт (additive) үйлдэл — түүхэн мөр устгахгүй, дарж бичихгүй.
-- ---------------------------------------------------------------------------

-- 1) Хуучин бүтээгдэхүүнүүдийн төрлийг тодорхой байдлаар нөхнө.
--    Бүх одоо байгаа бүтээгдэхүүн жортой тул MANUFACTURED.
--    (Багана нь DEFAULT 'MANUFACTURED'-тэй нэмэгдсэн ч давхар баталгаа болгож
--     тодорхой UPDATE хийв — үр дүн нь идемпотент.)
UPDATE "Product" SET "productType" = 'MANUFACTURED' WHERE "productType" IS NULL;

-- 2) RESALE-ийн нөөцийн талбарууд одоо байгаа мөрүүдэд 0 байна (DEFAULT).
--    MANUFACTURED бүтээгдэхүүний өртөг жорноос бодогдох тул энэ нь зөв.

-- ---------------------------------------------------------------------------
-- 3) CHECK: нөөцийн дэвтэр ба худалдан авалтын мөр нь түүхий эд ЭСВЭЛ
--    бүтээгдэхүүний ЯГ НЭГД нь хамаарна. Хоёулаа хоосон / хоёулаа дүүрэн
--    байхыг өгөгдлийн сангийн түвшинд хориглоно.
-- ---------------------------------------------------------------------------
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_subject_exactly_one"
  CHECK (("rawMaterialId" IS NOT NULL)::int + ("productId" IS NOT NULL)::int = 1);

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_subject_exactly_one"
  CHECK (("rawMaterialId" IS NOT NULL)::int + ("productId" IS NOT NULL)::int = 1);

-- ---------------------------------------------------------------------------
-- 4) Код автоматаар үүсгэх sequence-ууд.
--    MAX(code)+1 нь зэрэгцээ хүсэлтэд давхцаж болзошгүй тул Postgres
--    sequence ашиглана (баримтын дугаарлалттай ижил загвар).
--    Эхлэх утгыг одоо байгаа өгөгдлөөс тооцож, ХУУЧИН кодыг огт өөрчлөхгүй.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rm_start BIGINT;
  pr_start BIGINT;
BEGIN
  -- Одоо байгаа хамгийн том дугаар. RM-001 ба RM-0001 хоёулаа тоологдоно.
  SELECT COALESCE(MAX(NULLIF(regexp_replace("sku", '^RM-0*', ''), '')::BIGINT), 0) + 1
    INTO rm_start
    FROM "RawMaterial"
   WHERE "sku" ~ '^RM-[0-9]+$';

  -- Бүтээгдэхүүн: хуучин FP- угтвар ба шинэ PR- угтвар хоёуланг нь тооцно.
  SELECT COALESCE(MAX(NULLIF(regexp_replace("sku", '^(PR|FP)-0*', ''), '')::BIGINT), 0) + 1
    INTO pr_start
    FROM "Product"
   WHERE "sku" ~ '^(PR|FP)-[0-9]+$';

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS raw_material_code_seq START %s', GREATEST(rm_start, 1));
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS product_code_seq START %s', GREATEST(pr_start, 1));
END
$$;
