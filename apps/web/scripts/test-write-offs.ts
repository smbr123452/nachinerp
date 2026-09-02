/**
 * Актаар хасалтын домэйн шалгалт.
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэгээ эцэст нь устгаж, түүхэн өгөгдөлд
 * ХҮРЭХГҮЙ. Шалгалтын бараа нь "__ТЕСТ" угтвартай тусдаа мастер өгөгдөл.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import {
  createWriteOffDraft, updateWriteOffDraft, deleteWriteOffDraft,
  postWriteOff, reverseWriteOff, writeOffReport, listWriteOffCandidates,
} from "../src/server/services/write-offs";
import { postPurchase } from "../src/server/services/purchases";
import { verifyLedgerConsistency } from "../src/server/services/inventory";

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
const qtyOf = async (kind: "m" | "p", id: string) =>
  kind === "m"
    ? new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id } })).quantity)
    : new D((await prisma.product.findUniqueOrThrow({ where: { id } })).quantity);
const wacOf = async (kind: "m" | "p", id: string) =>
  kind === "m"
    ? new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id } })).averageCost)
    : new D((await prisma.product.findUniqueOrThrow({ where: { id } })).averageCost);

/** Буцаах action заавал requireOwner()-ээр хамгаалагдсан байх ёстой. */
const OWNER_ONLY = [
  { file: "src/app/(app)/materials/write-offs/actions.ts", fn: "reverseWriteOffAction" },
];

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const manager = await prisma.user.findFirstOrThrow({ where: { role: "MANAGER" } });
  const stamp = Date.now();

  const actIds: string[] = [];
  const purchaseIds: string[] = [];

  // Тусдаа шалгалтын бараа — түүхэн өгөгдөлд хүрэхгүй.
  const material = await prisma.rawMaterial.create({
    data: { sku: `__WO-M-${stamp}`, name: `__ТЕСТ сүү ${stamp}`, unit: "LITER" },
  });
  const resale = await prisma.product.create({
    data: {
      sku: `__WO-R-${stamp}`, name: `__ТЕСТ кола ${stamp}`,
      productType: "RESALE", unit: "PCS", sellingPrice: 3000,
    },
  });
  const manufactured = await prisma.product.create({
    data: {
      sku: `__WO-F-${stamp}`, name: `__ТЕСТ талх ${stamp}`,
      productType: "MANUFACTURED", unit: "PCS", sellingPrice: 2000,
    },
  });

  try {
    // Нөөц цэнэглэх: материал 10 × 5,000₮ ; бэлэн бүтээгдэхүүн 20 × 1,200₮
    const seed = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      idempotencyKey: `__wo-seed-${stamp}`,
      items: [
        { rawMaterialId: material.id, quantity: 10, unit: "LITER", unitPrice: 5000 },
        { productId: resale.id, quantity: 20, unit: "PCS", unitPrice: 1200 },
      ],
    });
    purchaseIds.push(seed.id);

    // ---- 1-2. Ноорог үүсгэх — нөөцөд НӨЛӨӨЛӨХГҮЙ -------------------------
    const qtyBefore = await qtyOf("m", material.id);
    const draft = await createWriteOffDraft({
      date: new Date(), reason: "EXPIRED", userId: owner.id,
      lines: [{ rawMaterialId: material.id, quantity: 3 }],
    });
    actIds.push(draft.id);
    check("1. Ноорог акт үүсэв", /^АКТ-\d{6}$/.test(draft.documentNo), draft.documentNo);
    check("2. Ноорог нөөцөд нөлөөлөөгүй", (await qtyOf("m", material.id)).equals(qtyBefore));
    check("2b. Ноорогт хөдөлгөөн үүсээгүй",
      (await prisma.inventoryMovement.count({ where: { referenceId: draft.id } })) === 0);

    // ---- 3, 11, 12. Материалын акт батлах ------------------------------
    const wacBefore = await wacOf("m", material.id);
    const posted = await postWriteOff({ writeOffId: draft.id, userId: owner.id });
    check("3. Материалын акт батлагдав", posted.posted === true);
    check("3b. Нөөц 3-аар хасагдав",
      (await qtyOf("m", material.id)).equals(qtyBefore.minus(3)));
    check("3c. WRITE_OFF_OUT хөдөлгөөн үүсэв",
      (await prisma.inventoryMovement.count({
        where: { referenceId: draft.id, movementType: "WRITE_OFF_OUT" },
      })) === 1);
    const item1 = await prisma.inventoryWriteOffItem.findFirstOrThrow({
      where: { writeOffId: draft.id },
    });
    check("11. Дундаж өртөг царцав",
      new D(item1.frozenUnitCost).equals(wacBefore), item1.frozenUnitCost.toString());
    check("11b. Мөрийн дүн = тоо × царцсан өртөг",
      new D(item1.totalCost).equals(new D(3).times(wacBefore).toDecimalPlaces(2)));
    check("12. Хасалт дундаж өртгийг эвдээгүй",
      (await wacOf("m", material.id)).equals(wacBefore));
    check("12b. Мөр ↔ хөдөлгөөний холбоос үүсэв", item1.movementId !== null);

    // ---- 4. Бэлэн бүтээгдэхүүний акт ------------------------------------
    const resaleQtyBefore = await qtyOf("p", resale.id);
    const resaleWac = await wacOf("p", resale.id);
    const act2 = await createWriteOffDraft({
      date: new Date(), reason: "DAMAGED", userId: owner.id,
      lines: [{ productId: resale.id, quantity: 2 }],
    });
    actIds.push(act2.id);
    await postWriteOff({ writeOffId: act2.id, userId: owner.id });
    check("4. Бэлэн бүтээгдэхүүн хасагдав",
      (await qtyOf("p", resale.id)).equals(resaleQtyBefore.minus(2)));
    check("4b. Түүний дундаж өртөг хэвээр", (await wacOf("p", resale.id)).equals(resaleWac));

    // ---- 5. Холимог акт --------------------------------------------------
    const mQty = await qtyOf("m", material.id);
    const pQty = await qtyOf("p", resale.id);
    const act3 = await createWriteOffDraft({
      date: new Date(), reason: "SPOILED", userId: owner.id,
      lines: [
        { rawMaterialId: material.id, quantity: 1 },
        { productId: resale.id, quantity: 3 },
      ],
    });
    actIds.push(act3.id);
    const posted3 = await postWriteOff({ writeOffId: act3.id, userId: owner.id });
    check("5. Холимог акт хоёр барааг хасав",
      (await qtyOf("m", material.id)).equals(mQty.minus(1)) &&
      (await qtyOf("p", resale.id)).equals(pQty.minus(3)));
    check("5b. Хоёр хөдөлгөөн үүсэв",
      (await prisma.inventoryMovement.count({ where: { referenceId: act3.id } })) === 2);
    const act3Items = await prisma.inventoryWriteOffItem.findMany({ where: { writeOffId: act3.id } });
    const act3Sum = act3Items.reduce((a, i) => a.plus(new D(i.totalCost)), new D(0));
    check("5c. Актын дүн = мөрүүдийн нийлбэр",
      posted3.totalCost.equals(act3Sum), `${posted3.totalCost} vs ${act3Sum}`);

    // ---- 6. Үйлдвэрлэдэг бүтээгдэхүүн татгалзагдана ---------------------
    const manuErr = await expectThrow(() =>
      createWriteOffDraft({
        date: new Date(), reason: "LOSS", userId: owner.id,
        lines: [{ productId: manufactured.id, quantity: 1 }],
      }));
    check("6. Үйлдвэрлэдэг бүтээгдэхүүн татгалзагдав",
      manuErr !== null && manuErr.includes("үйлдвэрлэдэг"), manuErr ?? "алдаа гараагүй");
    check("6b. Сонголтын жагсаалтад ороогүй",
      !(await listWriteOffCandidates()).some((c) => c.id === manufactured.id));

    // ---- 7. Үлдэгдлээс их бол татгалзана --------------------------------
    const available = await qtyOf("m", material.id);
    const over = await createWriteOffDraft({
      date: new Date(), reason: "LOSS", userId: owner.id,
      lines: [{ rawMaterialId: material.id, quantity: available.plus(1).toString() }],
    });
    actIds.push(over.id);
    const overErr = await expectThrow(() => postWriteOff({ writeOffId: over.id, userId: owner.id }));
    check("7. Үлдэгдлээс их хасалт татгалзагдав",
      overErr !== null && overErr.includes("хүрэлцэхгүй"), overErr ?? "алдаа гараагүй");
    check("7b. Татгалзсаны дараа нөөц хэвээр",
      (await qtyOf("m", material.id)).equals(available));
    check("7c. Татгалзсан акт ноорог хэвээр",
      (await prisma.inventoryWriteOff.findUniqueOrThrow({ where: { id: over.id } })).status === "DRAFT");

    // ---- 9-10. Тэг ба сөрөг тоо -----------------------------------------
    const zeroErr = await expectThrow(() =>
      createWriteOffDraft({
        date: new Date(), reason: "LOSS", userId: owner.id,
        lines: [{ rawMaterialId: material.id, quantity: 0 }],
      }));
    check("9. Тэг тоо татгалзагдав", zeroErr !== null && zeroErr.includes("0-ээс их"));
    const negErr = await expectThrow(() =>
      createWriteOffDraft({
        date: new Date(), reason: "LOSS", userId: owner.id,
        lines: [{ rawMaterialId: material.id, quantity: -2 }],
      }));
    check("10. Сөрөг тоо татгалзагдав", negErr !== null && negErr.includes("0-ээс их"));

    // ---- 27. "Бусад" шалтгаанд тайлбар шаардана -------------------------
    const noteErr = await expectThrow(() =>
      createWriteOffDraft({
        date: new Date(), reason: "OTHER", userId: owner.id,
        lines: [{ rawMaterialId: material.id, quantity: 1 }],
      }));
    check("27. OTHER тайлбаргүй бол татгалзана",
      noteErr !== null && noteErr.includes("тайлбар"), noteErr ?? "алдаа гараагүй");
    const withNote = await createWriteOffDraft({
      date: new Date(), reason: "OTHER", note: "Агуулахын үер", userId: owner.id,
      lines: [{ rawMaterialId: material.id, quantity: 1 }],
    });
    actIds.push(withNote.id);
    check("27b. OTHER тайлбартай бол зөвшөөрнө", Boolean(withNote.id));
    await deleteWriteOffDraft({ writeOffId: withNote.id, userId: owner.id });

    // ---- 13. Хожмын худалдан авалт түүхэн дүнг өөрчлөхгүй ---------------
    const histBefore = new D(
      (await prisma.inventoryWriteOffItem.findUniqueOrThrow({ where: { id: item1.id } })).frozenUnitCost,
    );
    const laterBuy = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      idempotencyKey: `__wo-later-${stamp}`,
      items: [{ rawMaterialId: material.id, quantity: 10, unit: "LITER", unitPrice: 9000 }],
    });
    purchaseIds.push(laterBuy.id);
    const wacAfterBuy = await wacOf("m", material.id);
    const histAfter = await prisma.inventoryWriteOffItem.findUniqueOrThrow({ where: { id: item1.id } });
    check("13. Дундаж өртөг өөрчлөгдсөн", !wacAfterBuy.equals(histBefore), wacAfterBuy.toString());
    check("13b. Түүхэн царцсан өртөг хэвээр",
      new D(histAfter.frozenUnitCost).equals(histBefore), histAfter.frozenUnitCost.toString());
    check("13c. Түүхэн мөрийн дүн хэвээр",
      new D(histAfter.totalCost).equals(new D(item1.totalCost)));

    // ---- 8. Үлдэгдэлтэй тэнцүү хэмжээ зөвшөөрөгдөнө ---------------------
    const exactMaterial = await prisma.rawMaterial.create({
      data: { sku: `__WO-E-${stamp}`, name: `__ТЕСТ давс ${stamp}`, unit: "KG" },
    });
    const exactBuy = await postPurchase({
      date: new Date(), paymentMethod: "CASH", userId: owner.id,
      idempotencyKey: `__wo-exact-${stamp}`,
      items: [{ rawMaterialId: exactMaterial.id, quantity: 4, unit: "KG", unitPrice: 800 }],
    });
    purchaseIds.push(exactBuy.id);
    const exactAct = await createWriteOffDraft({
      date: new Date(), reason: "QUALITY_REJECTED", userId: owner.id,
      lines: [{ rawMaterialId: exactMaterial.id, quantity: 4 }],
    });
    actIds.push(exactAct.id);
    await postWriteOff({ writeOffId: exactAct.id, userId: owner.id });
    check("8. Үлдэгдэлтэй тэнцүү хасалт зөвшөөрөгдөв",
      (await qtyOf("m", exactMaterial.id)).equals(new D(0)));

    // ---- 14. Менежер үүсгэж, батална ------------------------------------
    const mgrAct = await createWriteOffDraft({
      date: new Date(), reason: "SPILLED_BROKEN", userId: manager.id,
      lines: [{ rawMaterialId: material.id, quantity: 1 }],
    });
    actIds.push(mgrAct.id);
    const mgrPosted = await postWriteOff({ writeOffId: mgrAct.id, userId: manager.id });
    check("14. Менежер акт үүсгэж баталлаа", mgrPosted.posted === true);

    // ---- 15. Менежер буцаах эрхгүй (эх кодын хамгаалалт) ----------------
    for (const { file, fn } of OWNER_ONLY) {
      const source = await readFile(file, "utf8");
      const start = source.indexOf(`export async function ${fn}(`);
      const body = start >= 0 ? source.slice(start, start + 900) : "";
      check(`15. ${fn} нь requireOwner()-ээр хамгаалагдсан`,
        start >= 0 && body.includes("await requireOwner()") && !body.includes("await requireOperator()"));
    }

    // ---- 16-18. Эзэн буцаана --------------------------------------------
    const beforeReverse = await qtyOf("m", material.id);
    const wacBeforeReverse = await wacOf("m", material.id);
    const reversed = await reverseWriteOff({
      writeOffId: mgrAct.id, userId: owner.id, note: "Буруу бүртгэсэн",
    });
    check("16. Эзэн актыг буцаав", reversed.documentNo === mgrPosted.documentNo);
    check("17. Буцаалт нөөцийг сэргээв",
      (await qtyOf("m", material.id)).equals(beforeReverse.plus(1)));
    const revMove = await prisma.inventoryMovement.findFirstOrThrow({
      where: { referenceId: mgrAct.id, movementType: "WRITE_OFF_REVERSAL_IN" },
    });
    const mgrItem = await prisma.inventoryWriteOffItem.findFirstOrThrow({
      where: { writeOffId: mgrAct.id },
    });
    check("18. Буцаалт ЭХ царцсан өртгөөр үнэлэгдэв",
      new D(revMove.unitCost).equals(new D(mgrItem.frozenUnitCost)),
      `${revMove.unitCost} vs ${mgrItem.frozenUnitCost}`);
    check("18b. Актын төлөв REVERSED",
      (await prisma.inventoryWriteOff.findUniqueOrThrow({ where: { id: mgrAct.id } })).status === "REVERSED");
    check("18c. Эх хөдөлгөөн устгагдаагүй",
      (await prisma.inventoryMovement.count({
        where: { referenceId: mgrAct.id, movementType: "WRITE_OFF_OUT" },
      })) === 1);
    // Нөөцийн нийт үнэлгээ хадгалагдсан эсэх: буцаалтын дараах үнэлгээ нь
    // өмнөх үнэлгээ + буцаасан барааны царцсан үнэлгээтэй тэнцэнэ.
    const valueBefore = beforeReverse.times(wacBeforeReverse);
    const valueAfter = (await qtyOf("m", material.id)).times(await wacOf("m", material.id));
    check("18d. Нөөцийн нийт үнэлгээ хадгалагдав",
      valueAfter.minus(valueBefore).minus(new D(mgrItem.frozenUnitCost)).abs().lessThan(new D("0.05")),
      `${valueBefore} → ${valueAfter}`);

    // ---- 19. Хоёр дахин буцаах боломжгүй --------------------------------
    const twiceErr = await expectThrow(() =>
      reverseWriteOff({ writeOffId: mgrAct.id, userId: owner.id }));
    check("19. Давхар буцаалт татгалзагдав",
      twiceErr !== null && twiceErr.includes("аль хэдийн буцаагдсан"), twiceErr ?? "алдаа гараагүй");

    // ---- 20-21. Батлагдсан актыг засах / устгах боломжгүй ---------------
    const editErr = await expectThrow(() =>
      updateWriteOffDraft({
        writeOffId: draft.id, date: new Date(), reason: "LOSS", userId: owner.id,
        lines: [{ rawMaterialId: material.id, quantity: 1 }],
      }));
    check("20. Батлагдсан актыг засах боломжгүй",
      editErr !== null && editErr.includes("ноорог"), editErr ?? "алдаа гараагүй");
    const delErr = await expectThrow(() =>
      deleteWriteOffDraft({ writeOffId: draft.id, userId: owner.id }));
    check("21. Батлагдсан актыг устгах боломжгүй",
      delErr !== null && delErr.includes("ноорог"), delErr ?? "алдаа гараагүй");

    // ---- 22-23. Давхар илгээлт -------------------------------------------
    const dupAct = await createWriteOffDraft({
      date: new Date(), reason: "EXPIRED", userId: owner.id,
      lines: [{ rawMaterialId: material.id, quantity: 2 }],
    });
    actIds.push(dupAct.id);
    const dupKey = `__wo-dup-${stamp}`;
    const qtyBeforeDup = await qtyOf("m", material.id);
    const first = await postWriteOff({ writeOffId: dupAct.id, userId: owner.id, idempotencyKey: dupKey });
    const second = await postWriteOff({ writeOffId: dupAct.id, userId: owner.id, idempotencyKey: dupKey });
    check("22. Дараалсан давхар илгээлт нэг л акт үүсгэв",
      first.id === second.id && first.posted === true && second.posted === false);
    check("23. Давхар илгээлт хөдөлгөөн давхардуулаагүй",
      (await prisma.inventoryMovement.count({
        where: { referenceId: dupAct.id, movementType: "WRITE_OFF_OUT" },
      })) === 1);
    check("23b. Нөөц зөвхөн нэг удаа хасагдав",
      (await qtyOf("m", material.id)).equals(qtyBeforeDup.minus(2)));

    // Зэрэгцээ давхар илгээлт
    const raceAct = await createWriteOffDraft({
      date: new Date(), reason: "EXPIRED", userId: owner.id,
      lines: [{ rawMaterialId: material.id, quantity: 1 }],
    });
    actIds.push(raceAct.id);
    const raceKey = `__wo-race-${stamp}`;
    const qtyBeforeRace = await qtyOf("m", material.id);
    const raceResults = await Promise.allSettled([
      postWriteOff({ writeOffId: raceAct.id, userId: owner.id, idempotencyKey: raceKey }),
      postWriteOff({ writeOffId: raceAct.id, userId: owner.id, idempotencyKey: raceKey }),
    ]);
    const raceOk = raceResults.filter((r) => r.status === "fulfilled").length;
    check("23c. Зэрэгцээ давхар илгээлт алдаа өгсөнгүй", raceOk === 2,
      raceResults.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")).join(" | "));
    check("23d. Зэрэгцээ илгээлт нэг л хөдөлгөөн үүсгэв",
      (await prisma.inventoryMovement.count({
        where: { referenceId: raceAct.id, movementType: "WRITE_OFF_OUT" },
      })) === 1);
    check("23e. Нөөц нэг л удаа хасагдав",
      (await qtyOf("m", material.id)).equals(qtyBeforeRace.minus(1)));

    // ---- 24. Зэрэгцээ хасалт сөрөг үлдэгдэл үүсгэхгүй -------------------
    const raceMaterial = await prisma.rawMaterial.create({
      data: { sku: `__WO-C-${stamp}`, name: `__ТЕСТ элсэн ${stamp}`, unit: "KG" },
    });
    const raceBuy = await postPurchase({
      date: new Date(), paymentMethod: "CASH", userId: owner.id,
      idempotencyKey: `__wo-cbuy-${stamp}`,
      items: [{ rawMaterialId: raceMaterial.id, quantity: 10, unit: "KG", unitPrice: 1000 }],
    });
    purchaseIds.push(raceBuy.id);
    const actA = await createWriteOffDraft({
      date: new Date(), reason: "LOSS", userId: owner.id,
      lines: [{ rawMaterialId: raceMaterial.id, quantity: 7 }],
    });
    const actB = await createWriteOffDraft({
      date: new Date(), reason: "LOSS", userId: manager.id,
      lines: [{ rawMaterialId: raceMaterial.id, quantity: 6 }],
    });
    actIds.push(actA.id, actB.id);
    const outcomes = await Promise.allSettled([
      postWriteOff({ writeOffId: actA.id, userId: owner.id }),
      postWriteOff({ writeOffId: actB.id, userId: manager.id }),
    ]);
    const succeeded = outcomes.filter((r) => r.status === "fulfilled").length;
    const finalQty = await qtyOf("m", raceMaterial.id);
    check("24. Зэрэгцээ хасалтын яг нэг нь амжилттай", succeeded === 1,
      `амжилттай: ${succeeded}`);
    check("24b. Үлдэгдэл сөрөг болоогүй", finalQty.greaterThanOrEqualTo(0), finalQty.toString());

    // ---- 25. Мөнгөн гүйлгээ ҮҮСГЭХГҮЙ ------------------------------------
    const moneyForActs = await prisma.moneyTransaction.count({
      where: { referenceId: { in: actIds } },
    });
    check("25. Акт мөнгөн гүйлгээ үүсгээгүй", moneyForActs === 0);
    check("25b. Актын referenceType-тай мөнгөн гүйлгээ алга",
      (await prisma.moneyTransaction.count({
        where: { referenceType: { in: ["INVENTORY_WRITE_OFF", "INVENTORY_WRITE_OFF_REVERSAL"] } },
      })) === 0);

    // ---- 26. Аудит бичлэг -------------------------------------------------
    const audits = await prisma.auditLog.findMany({
      where: { entityType: "InventoryWriteOff", entityId: { in: actIds } },
      select: { action: true },
    });
    const actions = new Set(audits.map((a) => a.action));
    check("26. Аудитад WRITE_OFF_CREATED бүртгэгдэв", actions.has("WRITE_OFF_CREATED"));
    check("26b. Аудитад WRITE_OFF_POSTED бүртгэгдэв", actions.has("WRITE_OFF_POSTED"));
    check("26c. Аудитад WRITE_OFF_REVERSED бүртгэгдэв", actions.has("WRITE_OFF_REVERSED"));

    // ---- 28. Тайланд буцаасан акт орохгүй --------------------------------
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const report = await writeOffReport({ from, to });
    const reportedIds = await prisma.inventoryWriteOff.findMany({
      where: { date: { gte: from, lte: to }, status: "POSTED" },
      select: { id: true, totalCost: true },
    });
    const expectedTotal = reportedIds.reduce((a, r) => a.plus(new D(r.totalCost)), new D(0));
    check("28. Тайлангийн дүн = батлагдсан актуудын нийлбэр",
      report.totalCost.equals(expectedTotal.toDecimalPlaces(2)),
      `${report.totalCost} vs ${expectedTotal}`);
    check("28b. Буцаасан акт хорогдолд тоологдоогүй",
      !reportedIds.some((r) => r.id === mgrAct.id) && report.reversedCount >= 1);
    check("28c. Тайлан шалтгаанаар задарсан", report.byReason.length > 0);

    // ---- 29. Дэвтрийн инвариант --------------------------------------
    const drift = await verifyLedgerConsistency(prisma);
    check("29. Нөөц ↔ дэвтрийн инвариант хэвээр", drift.length === 0,
      drift.map((r) => `${r.name}: ${r.stored} vs ${r.ledger}`).join("; "));

    // Актын дүн = мөрүүдийн нийлбэр (бүх батлагдсан акт дээр)
    const allPosted = await prisma.inventoryWriteOff.findMany({
      where: { id: { in: actIds }, status: { in: ["POSTED", "REVERSED"] } },
      include: { items: true },
    });
    const totalsMatch = allPosted.every((a) =>
      new D(a.totalCost).equals(
        a.items.reduce((s, i) => s.plus(new D(i.totalCost)), new D(0)).toDecimalPlaces(2),
      ));
    check("29b. Акт бүрийн дүн = мөрүүдийн нийлбэр", totalsMatch);
  } finally {
    // ---- Цэвэрлэгээ: өөрийн үүсгэсэн бүхнийг устгана -------------------
    await prisma.inventoryWriteOffItem.deleteMany({ where: { writeOffId: { in: actIds } } });
    await prisma.inventoryWriteOff.deleteMany({ where: { id: { in: actIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityType: "InventoryWriteOff", entityId: { in: actIds } },
    });
    const testIds = [material.id, resale.id, manufactured.id];
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          { rawMaterial: { sku: { startsWith: "__WO-" } } },
          { product: { sku: { startsWith: "__WO-" } } },
        ],
      },
    });
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    await prisma.moneyTransaction.deleteMany({ where: { referenceId: { in: purchaseIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: purchaseIds } } });
    await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "__WO-" } } });
    await prisma.rawMaterial.deleteMany({ where: { sku: { startsWith: "__WO-" } } });
    void testIds;
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
