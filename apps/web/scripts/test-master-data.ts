import { PrismaClient } from "@prisma/client";
import {
  listCategories, createCategory, renameCategory, setCategoryActive, deleteCategory,
} from "../src/server/services/categories";
import { nextEntityCode } from "../src/server/services/numbering";

const prisma = new PrismaClient();
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });

  // 1. create
  const name = `__ТЕСТ-${Date.now()}`;
  await createCategory({ kind: "product", name, userId: owner.id });
  let rows = await listCategories("product");
  const created = rows.find((r) => r.name === name);
  check("Ангилал үүсэв", Boolean(created) && created!.isActive && created!.usageCount === 0);

  // 2. rename
  const renamed = `${name}-Б`;
  await renameCategory({ kind: "product", id: created!.id, name: renamed, userId: owner.id });
  rows = await listCategories("product");
  check("Нэр солигдов", rows.some((r) => r.id === created!.id && r.name === renamed));

  // 3. deactivate / reactivate
  await setCategoryActive({ kind: "product", id: created!.id, isActive: false, userId: owner.id });
  rows = await listCategories("product");
  check("Идэвхгүй боллоо", rows.find((r) => r.id === created!.id)!.isActive === false);
  await setCategoryActive({ kind: "product", id: created!.id, isActive: true, userId: owner.id });
  rows = await listCategories("product");
  check("Сэргээгдлээ", rows.find((r) => r.id === created!.id)!.isActive === true);

  // 4. delete when safe (usage 0)
  await deleteCategory({ kind: "product", id: created!.id, userId: owner.id });
  rows = await listCategories("product");
  check("Ашиглагдаагүй ангилал устав", !rows.some((r) => r.id === created!.id));

  // 5. delete blocked when in use
  const inUse = (await listCategories("product")).find((r) => r.usageCount > 0);
  if (!inUse) { check("Ашиглагдаж буй ангилал олдсонгүй (алгаслаа)", true); }
  else {
    let blocked = false;
    let msg = "";
    try { await deleteCategory({ kind: "product", id: inUse.id, userId: owner.id }); }
    catch (e) { blocked = true; msg = (e as Error).message; }
    check("Ашиглагдаж буй ангиллыг устгахыг хориглов", blocked, msg);
    const still = await prisma.productCategory.findUnique({ where: { id: inUse.id } });
    check("Хориглосны дараа ангилал хэвээр байна", Boolean(still));
  }

  // 6. raw material side, in-use block
  const rmInUse = (await listCategories("rawMaterial")).find((r) => r.usageCount > 0);
  if (rmInUse) {
    let blocked = false;
    try { await deleteCategory({ kind: "rawMaterial", id: rmInUse.id, userId: owner.id }); }
    catch { blocked = true; }
    check("Материалын ашиглагдаж буй ангилал хамгаалагдсан", blocked);
  }

  // 7. audit trail
  const audits = await prisma.auditLog.count({
    where: { action: { in: ["CATEGORY_CREATED","CATEGORY_RENAMED","CATEGORY_DEACTIVATED","CATEGORY_REACTIVATED","CATEGORY_DELETED"] } },
  });
  check("Ангиллын үйлдлүүд аудитад бүртгэгдэв", audits >= 5, `${audits} бичлэг`);

  // 8. Кодын үүсгэлт — зэрэгцээ дуудалт давхцахгүй
  // Sequence-ийн төлөвийг is_called-тай нь хамт хадгална — эс тэгвээс
  // сэргээхэд нэг утгаар гулсана.
  type SeqState = { last_value: bigint; is_called: boolean };
  const [rmSeqBefore] = await prisma.$queryRawUnsafe<SeqState[]>(
    "SELECT last_value, is_called FROM raw_material_code_seq",
  );
  const [prSeqBefore] = await prisma.$queryRawUnsafe<SeqState[]>(
    "SELECT last_value, is_called FROM product_code_seq",
  );
  const codes = await Promise.all([
    nextEntityCode("rawMaterial"),
    nextEntityCode("rawMaterial"),
    nextEntityCode("rawMaterial"),
  ]);
  check("Зэрэгцээ дуудалтад код давхцахгүй", new Set(codes).size === 3, codes.join(", "));
  check(
    "Кодын хэлбэр RM-#### байна",
    codes.every((c) => /^RM-\d{4,}$/.test(c)),
    codes.join(", "),
  );
  const existingSkus = new Set((await prisma.rawMaterial.findMany({ select: { sku: true } })).map((m) => m.sku));
  check("Шинэ код хуучинтай давхцахгүй", codes.every((c) => !existingSkus.has(c)));

  const productCodes = await Promise.all([nextEntityCode("product"), nextEntityCode("product")]);
  check(
    "Бүтээгдэхүүний код PR-#### байна",
    productCodes.every((c) => /^PR-\d{4,}$/.test(c)),
    productCodes.join(", "),
  );

  // Тест нь бичлэг үүсгэлгүйгээр sequence-ийг урагшлуулсан тул яг өмнөх
  // төлөв рүү нь буцаана (дараагийн бодит код гээгдэхгүй).
  await prisma.$executeRawUnsafe(
    "SELECT setval('raw_material_code_seq', $1, $2)",
    Number(rmSeqBefore!.last_value),
    rmSeqBefore!.is_called,
  );
  await prisma.$executeRawUnsafe(
    "SELECT setval('product_code_seq', $1, $2)",
    Number(prSeqBefore!.last_value),
    prSeqBefore!.is_called,
  );

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
