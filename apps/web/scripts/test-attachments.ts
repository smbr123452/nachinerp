/**
 * Хавсралтын аюулгүй байдлын шалгалт.
 * Үүсгэсэн бүх бичлэг, файлаа эцэст нь устгана.
 */
import { PrismaClient } from "@prisma/client";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import {
  fileStorage, isValidStorageKey, isAllowedMimeType, MAX_ATTACHMENT_BYTES,
} from "../src/server/storage";
import {
  addPurchaseAttachment, listPurchaseAttachments, deletePurchaseAttachment,
  readAttachmentForDownload, sanitizeDisplayFileName,
} from "../src/server/services/attachments";

const prisma = new PrismaClient();
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

// Хамгийн бага хэмжээний хүчинтэй PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function makeFile(name: string, type: string, data: Buffer): File {
  return new File([new Uint8Array(data)], name, { type });
}

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const purchase = await prisma.purchase.findFirstOrThrow({ where: { status: "POSTED" } });
  const createdIds: string[] = [];

  try {
    // 1. Түлхүүрийн хэлбэрийн шалгалт — path traversal хаагдсан эсэх
    check("Хоосон түлхүүр татгалзсан", !isValidStorageKey(""));
    check("../ агуулсан түлхүүр татгалзсан", !isValidStorageKey("../../etc/passwd"));
    check("Файлын нэр шууд түлхүүр болохгүй", !isValidStorageKey("invoice.png"));
    check("Далд зам татгалзсан", !isValidStorageKey("a/b.png"));
    check("Зөв UUID түлхүүр зөвшөөрөгдсөн",
      isValidStorageKey("123e4567-e89b-12d3-a456-426614174000.png"));

    for (const bad of ["../../etc/passwd", "a/b.png", "x.png", ""]) {
      let threw = false;
      try { await fileStorage.get(bad); } catch { threw = true; }
      if (!threw) check(`fileStorage.get("${bad}") татгалзах ёстой байсан`, false);
    }
    check("Хадгалалт буруу түлхүүрээр унших оролдлогыг зогсоов", true);

    // 2. Төрлийн цагаан жагсаалт
    check("text/html зөвшөөрөгдөөгүй", !isAllowedMimeType("text/html"));
    check("image/svg+xml зөвшөөрөгдөөгүй", !isAllowedMimeType("image/svg+xml"));
    check("application/pdf зөвшөөрөгдсөн", isAllowedMimeType("application/pdf"));

    // 3. Файлын нэрийг цэвэрлэх — зам болон толгойд тарихаас хамгаална
    check('Зам агуулсан нэр цэвэрлэгдсэн',
      sanitizeDisplayFileName("../../etc/passwd") === "etc/passwd".split("/").pop(),
      sanitizeDisplayFileName("../../etc/passwd"));
    check('Хашилт агуулсан нэр цэвэрлэгдсэн',
      !sanitizeDisplayFileName('a"b\\c.png').includes('"'),
      sanitizeDisplayFileName('a"b\\c.png'));
    check("Хоосон нэр орлуулагдсан", sanitizeDisplayFileName("...") === "file");

    // 4. Бодит хавсаргалт
    await addPurchaseAttachment({
      purchaseId: purchase.id,
      file: makeFile("../../../evil name.png", "image/png", PNG),
      userId: owner.id,
    });
    const list = await listPurchaseAttachments(purchase.id);
    check("Хавсралт нэмэгдэв", list.length === 1, `${list.length}`);
    const added = list[0]!;
    createdIds.push(added.id);
    check("Харагдах нэрэнд зам үлдээгүй", !added.originalFileName.includes("/"), added.originalFileName);

    const row = await prisma.purchaseAttachment.findUniqueOrThrow({ where: { id: added.id } });
    check("Хадгалалтын түлхүүр санамсаргүй UUID", isValidStorageKey(row.storageKey), row.storageKey);
    check("Түлхүүр анхны файлын нэрийг агуулаагүй",
      !row.storageKey.includes("evil") && !row.storageKey.includes("name"));

    // 5. Уншилт
    const download = await readAttachmentForDownload(added.id);
    check("Татах өгөгдөл буцлаа", download !== null && download.data.equals(PNG));
    check("Content-Type цагаан жагсаалтаас", download?.mimeType === "image/png");

    // 6. Зөвшөөрөгдөөгүй төрөл татгалзана
    let rejected = false; let msg = "";
    try {
      await addPurchaseAttachment({
        purchaseId: purchase.id,
        file: makeFile("x.html", "text/html", Buffer.from("<script>alert(1)</script>")),
        userId: owner.id,
      });
    } catch (e) { rejected = true; msg = (e as Error).message; }
    check("HTML файл татгалзсан", rejected, msg);

    // 7. Хэмжээний хязгаар
    rejected = false;
    try {
      await addPurchaseAttachment({
        purchaseId: purchase.id,
        file: makeFile("big.png", "image/png", Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)),
        userId: owner.id,
      });
    } catch { rejected = true; }
    check("Хэт том файл татгалзсан", rejected);

    // 8. Аудит
    const audit = await prisma.auditLog.count({
      where: { action: "PURCHASE_ATTACHMENT_ADDED", entityId: purchase.id },
    });
    check("Хавсаргалт аудитад бүртгэгдэв", audit >= 1, `${audit}`);

    // 9. Устгахад файл ч устна
    const key = row.storageKey;
    const dir = process.env.ATTACHMENT_STORAGE_DIR ?? path.resolve(process.cwd(), ".storage", "attachments");
    await access(path.join(dir, key));
    await deletePurchaseAttachment({ attachmentId: added.id, userId: owner.id });
    createdIds.pop();
    let gone = false;
    try { await access(path.join(dir, key)); } catch { gone = true; }
    check("Устгахад диск дээрх файл ч устав", gone);
    check("Бүртгэл устав", (await listPurchaseAttachments(purchase.id)).length === 0);
    check("Устгалт аудитад бүртгэгдэв",
      (await prisma.auditLog.count({ where: { action: "PURCHASE_ATTACHMENT_DELETED" } })) >= 1);
  } finally {
    for (const id of createdIds) {
      await deletePurchaseAttachment({ attachmentId: id, userId: owner.id }).catch(() => {});
    }
    await prisma.auditLog.deleteMany({
      where: { action: { in: ["PURCHASE_ATTACHMENT_ADDED", "PURCHASE_ATTACHMENT_DELETED"] } },
    });
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
