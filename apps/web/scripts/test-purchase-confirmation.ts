/**
 * Худалдан авалт баталгаажуулах урсгалын шалгалт.
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэг, файлаа эцэст нь устгаж, түүхэн
 * өгөгдөлд ХҮРЭХГҮЙ.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { access } from "node:fs/promises";
import path from "node:path";
import { postPurchase, cancelPurchase } from "../src/server/services/purchases";
import {
  addPurchaseAttachment, deletePurchaseAttachment, listPurchaseAttachments,
  readAttachmentForDownload,
} from "../src/server/services/attachments";
import { fileStorage } from "../src/server/storage";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}
async function expectThrow(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const STORAGE_DIR =
  process.env.ATTACHMENT_STORAGE_DIR ?? path.resolve(process.cwd(), ".storage", "attachments");

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const material = await prisma.rawMaterial.findFirstOrThrow({ where: { isActive: true } });
  const purchaseIds: string[] = [];
  const storageKeys: string[] = [];

  const before = {
    purchases: await prisma.purchase.count(),
    movements: await prisma.inventoryMovement.count(),
    money: await prisma.moneyTransaction.count(),
    qty: new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).quantity),
  };

  try {
    // ---- 1. Баталгаажуулалт нөөцийг нэмнэ -------------------------------
    const key1 = `__test-${Date.now()}-a`;
    const p1 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id, idempotencyKey: key1,
      items: [{ rawMaterialId: material.id, quantity: 5, unit: material.unit, unitPrice: 1000 }],
    });
    purchaseIds.push(p1.id);
    check("1a. Баримт үүсэв", p1.created === true);
    const afterOne = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    check("1b. Нөөц 5-аар нэмэгдэв",
      new D(afterOne.quantity).equals(before.qty.plus(5)), afterOne.quantity.toString());
    check("1c. Нөөцийн хөдөлгөөн үүсэв",
      (await prisma.inventoryMovement.count({ where: { referenceId: p1.id } })) === 1);
    check("1d. Мөнгөн гүйлгээ үүсэв",
      (await prisma.moneyTransaction.count({ where: { referenceId: p1.id } })) === 1);

    // ---- 2. Давхар илгээлт ШИНЭ баримт үүсгэхгүй -------------------------
    const p1again = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id, idempotencyKey: key1,
      items: [{ rawMaterialId: material.id, quantity: 5, unit: material.unit, unitPrice: 1000 }],
    });
    check("2a. Ижил түлхүүр өмнөх баримтыг буцаав", p1again.id === p1.id && p1again.created === false);
    check("2b. Шинэ баримт үүсээгүй",
      (await prisma.purchase.count()) === before.purchases + 1);
    const afterDup = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    check("2c. Нөөц ХОЁР ДАХИН нэмэгдээгүй",
      new D(afterDup.quantity).equals(before.qty.plus(5)), afterDup.quantity.toString());
    check("2d. Нэмэлт хөдөлгөөн үүсээгүй",
      (await prisma.inventoryMovement.count({ where: { referenceId: p1.id } })) === 1);

    // ---- 3. Зэрэгцээ давхар илгээлт --------------------------------------
    const key2 = `__test-${Date.now()}-b`;
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        postPurchase({
          date: new Date(), paymentMethod: "BANK", userId: owner.id, idempotencyKey: key2,
          items: [{ rawMaterialId: material.id, quantity: 2, unit: material.unit, unitPrice: 500 }],
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const ids = new Set(ok.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    for (const id of ids) purchaseIds.push(id);
    check("3a. Зэрэгцээ 4 хүсэлтээс ЯГ нэг баримт үүсэв", ids.size === 1, `${ids.size} баримт`);
    const rowsForKey = await prisma.purchase.count({ where: { idempotencyKey: key2 } });
    check("3b. Өгөгдлийн санд ч нэг мөр", rowsForKey === 1, `${rowsForKey}`);

    // ---- 4. Баримтын зураг баримттайгаа хамт үүснэ -----------------------
    const stored = await fileStorage.put({ data: PNG, mimeType: "image/png" });
    storageKeys.push(stored.storageKey);
    const key3 = `__test-${Date.now()}-c`;
    const p3 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id, idempotencyKey: key3,
      items: [{ rawMaterialId: material.id, quantity: 1, unit: material.unit, unitPrice: 100 }],
      receipt: {
        storageKey: stored.storageKey, originalFileName: "receipt.png",
        mimeType: "image/png", fileSize: stored.fileSize,
      },
    });
    purchaseIds.push(p3.id);
    const attached = await listPurchaseAttachments(p3.id);
    check("4a. Зураг баримтад хавсрагдав", attached.length === 1, `${attached.length}`);
    check("4b. Зураг гэж танигдав", attached[0]!.isImage === true);
    const download = await readAttachmentForDownload(attached[0]!.id);
    check("4c. Зураг уншигдаж байна", download !== null && download.data.equals(PNG));
    check("4d. isImage талбар inline үзүүлэхэд бэлэн", download?.isImage === true);

    // ---- 5. Зураггүй ч баталгаажина --------------------------------------
    const key4 = `__test-${Date.now()}-d`;
    const p4 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id, idempotencyKey: key4,
      items: [{ rawMaterialId: material.id, quantity: 1, unit: material.unit, unitPrice: 100 }],
    });
    purchaseIds.push(p4.id);
    check("5. Зураг заавал биш — баримт үүсэв",
      (await listPurchaseAttachments(p4.id)).length === 0);

    // ---- 6. Баталгаажсан баримт өөрчлөгдөхгүй ----------------------------
    const addMsg = await expectThrow(() =>
      addPurchaseAttachment({
        purchaseId: p3.id,
        file: new File([new Uint8Array(PNG)], "extra.png", { type: "image/png" }),
        userId: owner.id,
      }));
    check("6a. Баталгаажсан баримтад зураг НЭМЭХ хоригдов", addMsg !== null, addMsg ?? "");
    const delMsg = await expectThrow(() =>
      deletePurchaseAttachment({ attachmentId: attached[0]!.id, userId: owner.id }));
    check("6b. Баталгаажсан баримтын зургийг УСТГАХ хоригдов", delMsg !== null, delMsg ?? "");
    check("6c. Зураг хэвээр байна", (await listPurchaseAttachments(p3.id)).length === 1);

    // Цуцлагдсан баримт ч эцэслэгдсэн
    await cancelPurchase({ purchaseId: p4.id, userId: owner.id, note: "тест" });
    const cancelledMsg = await expectThrow(() =>
      addPurchaseAttachment({
        purchaseId: p4.id,
        file: new File([new Uint8Array(PNG)], "x.png", { type: "image/png" }),
        userId: owner.id,
      }));
    check("6d. Цуцлагдсан баримтад ч зураг нэмэх хоригдов", cancelledMsg !== null);

    // ---- 7. Аудит ---------------------------------------------------------
    const confirmed = await prisma.auditLog.count({
      where: { action: "PURCHASE_CONFIRMED", entityId: { in: purchaseIds } },
    });
    check("7a. PURCHASE_CONFIRMED аудитад бүртгэгдэв", confirmed === purchaseIds.length,
      `${confirmed}/${purchaseIds.length}`);
    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PURCHASE_CONFIRMED", entityId: p3.id },
    });
    check("7b. Аудит нь баталгаажуулсан хэрэглэгчийг агуулсан", auditRow.userId === owner.id);
    check("7c. Аудит нь зурагтай эсэхийг тэмдэглэсэн",
      (auditRow.newValue as { hasReceipt?: boolean } | null)?.hasReceipt === true);

    // ---- 8. Түлхүүргүй баримтууд хоорондоо зөрчилдөхгүй -------------------
    const n1 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      items: [{ rawMaterialId: material.id, quantity: 1, unit: material.unit, unitPrice: 10 }],
    });
    const n2 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      items: [{ rawMaterialId: material.id, quantity: 1, unit: material.unit, unitPrice: 10 }],
    });
    purchaseIds.push(n1.id, n2.id);
    check("8. Түлхүүргүй хоёр баримт зэрэгцэн үүсэв (NULL нь ялгаатай)",
      n1.id !== n2.id && n1.created && n2.created);
  } finally {
    for (const id of purchaseIds) {
      const atts = await prisma.purchaseAttachment.findMany({ where: { purchaseId: id } });
      for (const a of atts) await fileStorage.delete(a.storageKey).catch(() => {});
      await prisma.purchaseAttachment.deleteMany({ where: { purchaseId: id } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await prisma.purchase.delete({ where: { id } }).catch(() => {});
    }
    for (const k of storageKeys) await fileStorage.delete(k).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { entityId: { in: purchaseIds } } });

    // Нөөц, өртгийг тестийн өмнөх байдалд нь эргүүлэх шаардлагагүй:
    // дээрх устгалт нь хөдөлгөөнийг арилгасан тул үлдэгдлийг гараар засна.
    await prisma.rawMaterial.update({
      where: { id: material.id },
      data: { quantity: before.qty },
    });
  }

  const after = {
    purchases: await prisma.purchase.count(),
    movements: await prisma.inventoryMovement.count(),
    money: await prisma.moneyTransaction.count(),
    qty: new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).quantity),
  };
  check("Цэвэрлэгээ: баримтын тоо сэргэв", after.purchases === before.purchases);
  check("Цэвэрлэгээ: хөдөлгөөний тоо сэргэв", after.movements === before.movements);
  check("Цэвэрлэгээ: мөнгөн гүйлгээний тоо сэргэв", after.money === before.money);
  check("Цэвэрлэгээ: үлдэгдэл сэргэв", after.qty.equals(before.qty),
    `${after.qty} vs ${before.qty}`);
  let orphan = 0;
  for (const k of storageKeys) {
    try { await access(path.join(STORAGE_DIR, k)); orphan += 1; } catch { /* устсан */ }
  }
  check("Цэвэрлэгээ: өнчин файл үлдээгүй", orphan === 0, `${orphan}`);

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
