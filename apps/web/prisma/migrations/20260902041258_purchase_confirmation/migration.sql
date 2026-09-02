-- Баталгаажуулалтыг давхардуулахаас хамгаалах түлхүүр.
-- Бүрэн НЭМЭЛТ өөрчлөлт: багана нэмэгдэнэ, юу ч устахгүй, дарж бичигдэхгүй.
-- Хуучин баримтуудад утга NULL хэвээр үлдэнэ.
ALTER TABLE "Purchase" ADD COLUMN "idempotencyKey" TEXT;

-- Postgres-д NULL нь ялгаатай гэж тооцогддог тул түлхүүргүй хуучин
-- баримтууд энэ индекст саад болохгүй.
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");
