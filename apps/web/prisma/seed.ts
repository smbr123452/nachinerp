/**
 * Жишээ өгөгдөл. `npm run db:seed`.
 * Домэйны логикийг давхардуулахгүйн тулд бодит сервисүүдийг дуудаж
 * худалдан авалт / борлуулалтыг бүртгэдэг — ингэснээр дэвтрүүд бодитой болно.
 */
import { PrismaClient, type Unit } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const { postPurchase } = await import("../src/server/services/purchases");
  const { postSalesBatch } = await import("../src/server/services/sales");
  const { postExpense } = await import("../src/server/services/expenses");
  const { postBankDeposit } = await import("../src/server/services/adjustments");

  console.log("Өмнөх өгөгдлийг цэвэрлэж байна...");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.moneyTransaction.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventoryCountItem.deleteMany(),
    prisma.inventoryCount.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.saleBatch.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.expenseCategory.deleteMany(),
    prisma.recipeItem.deleteMany(),
    prisma.product.deleteMany(),
    prisma.productCategory.deleteMany(),
    prisma.rawMaterial.deleteMany(),
    prisma.rawMaterialCategory.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.systemSetting.deleteMany(),
  ]);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE purchase_no_seq RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE sale_batch_no_seq RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE inventory_count_no_seq RESTART WITH 1`);

  // --- Хэрэглэгчид ---------------------------------------------------------
  const passwordHash = await bcrypt.hash("Password123!", 12);
  const owner = await prisma.user.create({
    data: { email: "owner@example.com", name: "Батбаяр (Эзэн)", role: "OWNER", passwordHash },
  });
  const manager = await prisma.user.create({
    data: { email: "manager@example.com", name: "Оюунаа (Менежер)", role: "MANAGER", passwordHash },
  });

  await prisma.systemSetting.createMany({
    data: [
      { key: "company_name", value: "Начин Фүүд ХХК" },
      { key: "allow_negative_stock", value: "false" },
    ],
  });

  // --- Ангилал -------------------------------------------------------------
  const materialCategories = await Promise.all(
    ["Гурилан бүтээгдэхүүн", "Сүү, цагаан идээ", "Мах", "Кофе", "Сав баглаа", "Бусад"].map((name) =>
      prisma.rawMaterialCategory.create({ data: { name } }),
    ),
  );
  const [flourCat, dairyCat, meatCat, coffeeCat, packagingCat, otherCat] = materialCategories;

  const productCategories = await Promise.all(
    ["Пицца", "Кофе", "Бэйкери", "Ундаа"].map((name) => prisma.productCategory.create({ data: { name } })),
  );
  const [pizzaCat, coffeeProductCat, bakeryCat] = productCategories;

  // --- Бараа материал ------------------------------------------------------
  const materialSpecs: {
    sku: string;
    name: string;
    unit: Unit;
    minimumStock: string;
    categoryId: string;
  }[] = [
    { sku: "RM-001", name: "Гурил", unit: "KG", minimumStock: "100", categoryId: flourCat!.id },
    { sku: "RM-002", name: "Элсэн чихэр", unit: "KG", minimumStock: "40", categoryId: otherCat!.id },
    { sku: "RM-003", name: "Бяслаг", unit: "KG", minimumStock: "25", categoryId: dairyCat!.id },
    { sku: "RM-004", name: "Тахианы мах", unit: "KG", minimumStock: "20", categoryId: meatCat!.id },
    { sku: "RM-005", name: "Сүү", unit: "LITER", minimumStock: "60", categoryId: dairyCat!.id },
    { sku: "RM-006", name: "Кофены үр", unit: "KG", minimumStock: "10", categoryId: coffeeCat!.id },
    { sku: "RM-007", name: "Пиццаны хайрцаг", unit: "PCS", minimumStock: "200", categoryId: packagingCat!.id },
    { sku: "RM-008", name: "Кофены аяга", unit: "PCS", minimumStock: "300", categoryId: packagingCat!.id },
    { sku: "RM-009", name: "Аягны таг", unit: "PCS", minimumStock: "300", categoryId: packagingCat!.id },
    { sku: "RM-010", name: "Соус", unit: "KG", minimumStock: "15", categoryId: otherCat!.id },
    { sku: "RM-011", name: "Өндөг", unit: "PCS", minimumStock: "150", categoryId: otherCat!.id },
    { sku: "RM-012", name: "Цөцгийн тос", unit: "KG", minimumStock: "20", categoryId: dairyCat!.id },
  ];

  const materials: Record<string, string> = {};
  for (const spec of materialSpecs) {
    const created = await prisma.rawMaterial.create({ data: spec });
    materials[spec.sku] = created.id;
  }

  // --- Нийлүүлэгч ----------------------------------------------------------
  const supplier = await prisma.supplier.create({
    data: { name: "Алтан Тариа ХХК", phone: "77001122" },
  });
  const dairySupplier = await prisma.supplier.create({
    data: { name: "Сүү ХК", phone: "77003344" },
  });

  // --- Бүтээгдэхүүн --------------------------------------------------------
  const chickenPizza = await prisma.product.create({
    data: { sku: "FP-001", name: "Chicken Pizza", sellingPrice: "35000", categoryId: pizzaCat!.id },
  });
  const latte = await prisma.product.create({
    data: { sku: "FP-002", name: "Latte", sellingPrice: "9000", categoryId: coffeeProductCat!.id },
  });
  const americano = await prisma.product.create({
    data: { sku: "FP-003", name: "Americano", sellingPrice: "7500", categoryId: coffeeProductCat!.id },
  });
  const cake = await prisma.product.create({
    data: { sku: "FP-004", name: "Birthday Cake", sellingPrice: "85000", categoryId: bakeryCat!.id },
  });

  await prisma.recipeItem.createMany({
    data: [
      // Chicken Pizza
      { productId: chickenPizza.id, rawMaterialId: materials["RM-001"]!, quantity: "0.25", unit: "KG" },
      { productId: chickenPizza.id, rawMaterialId: materials["RM-003"]!, quantity: "0.12", unit: "KG" },
      { productId: chickenPizza.id, rawMaterialId: materials["RM-004"]!, quantity: "0.1", unit: "KG" },
      { productId: chickenPizza.id, rawMaterialId: materials["RM-010"]!, quantity: "0.05", unit: "KG" },
      { productId: chickenPizza.id, rawMaterialId: materials["RM-007"]!, quantity: "1", unit: "PCS" },
      // Latte
      { productId: latte.id, rawMaterialId: materials["RM-006"]!, quantity: "18", unit: "GRAM" },
      { productId: latte.id, rawMaterialId: materials["RM-005"]!, quantity: "220", unit: "ML" },
      { productId: latte.id, rawMaterialId: materials["RM-008"]!, quantity: "1", unit: "PCS" },
      { productId: latte.id, rawMaterialId: materials["RM-009"]!, quantity: "1", unit: "PCS" },
      // Americano
      { productId: americano.id, rawMaterialId: materials["RM-006"]!, quantity: "18", unit: "GRAM" },
      { productId: americano.id, rawMaterialId: materials["RM-008"]!, quantity: "1", unit: "PCS" },
      { productId: americano.id, rawMaterialId: materials["RM-009"]!, quantity: "1", unit: "PCS" },
      // Birthday Cake
      { productId: cake.id, rawMaterialId: materials["RM-001"]!, quantity: "0.8", unit: "KG" },
      { productId: cake.id, rawMaterialId: materials["RM-002"]!, quantity: "0.5", unit: "KG" },
      { productId: cake.id, rawMaterialId: materials["RM-012"]!, quantity: "0.35", unit: "KG" },
      { productId: cake.id, rawMaterialId: materials["RM-011"]!, quantity: "6", unit: "PCS" },
      { productId: cake.id, rawMaterialId: materials["RM-005"]!, quantity: "0.4", unit: "LITER" },
    ],
  });

  // --- Зардлын ангилал -----------------------------------------------------
  const expenseCategoryNames = [
    "Түлш",
    "Засвар",
    "Хүргэлтийн зардал",
    "Цэвэрлэгээ",
    "Бичиг хэрэг",
    "Ашиглалтын төлбөр",
    "Тээвэр",
    "Бусад",
  ];
  const expenseCategories = await Promise.all(
    expenseCategoryNames.map((name) => prisma.expenseCategory.create({ data: { name } })),
  );

  // --- Худалдан авалт ------------------------------------------------------
  const daysAgo = (n: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - n);
    return date;
  };

  // Нээлтийн үлдэгдэл — эзний тохируулгаар банкны дансыг эхлүүлнэ.
  const { postMoneyAdjustment } = await import("../src/server/services/adjustments");
  await postMoneyAdjustment({
    account: "BANK",
    direction: "IN",
    amount: "60000000",
    note: "Нээлтийн үлдэгдэл",
    date: daysAgo(25),
    userId: owner.id,
  });

  console.log("Худалдан авалт бүртгэж байна...");
  // Эхний тохируулга — үнэ өссөнийг харуулахын тулд хоёр удаа гурил авна.
  await postPurchase({
    date: daysAgo(20),
    supplierId: supplier.id,
    paymentMethod: "BANK",
    note: "Сарын эхний нөөц",
    userId: manager.id,
    items: [
      { rawMaterialId: materials["RM-001"]!, quantity: "50", unit: "KG", unitPrice: "3000" },
      { rawMaterialId: materials["RM-002"]!, quantity: "60", unit: "KG", unitPrice: "2800" },
      { rawMaterialId: materials["RM-003"]!, quantity: "40", unit: "KG", unitPrice: "17500" },
      { rawMaterialId: materials["RM-004"]!, quantity: "35", unit: "KG", unitPrice: "14000" },
      { rawMaterialId: materials["RM-010"]!, quantity: "25", unit: "KG", unitPrice: "8500" },
    ],
  });

  await postPurchase({
    date: daysAgo(12),
    supplierId: supplier.id,
    paymentMethod: "BANK",
    note: "Гурилын үнэ өссөн",
    userId: manager.id,
    items: [
      { rawMaterialId: materials["RM-001"]!, quantity: "100", unit: "KG", unitPrice: "3300" },
      { rawMaterialId: materials["RM-007"]!, quantity: "500", unit: "PCS", unitPrice: "1200" },
      { rawMaterialId: materials["RM-008"]!, quantity: "800", unit: "PCS", unitPrice: "450" },
      { rawMaterialId: materials["RM-009"]!, quantity: "800", unit: "PCS", unitPrice: "150" },
    ],
  });

  await postPurchase({
    date: daysAgo(6),
    supplierId: dairySupplier.id,
    paymentMethod: "BANK",
    userId: manager.id,
    items: [
      { rawMaterialId: materials["RM-005"]!, quantity: "200", unit: "LITER", unitPrice: "3600" },
      { rawMaterialId: materials["RM-006"]!, quantity: "25", unit: "KG", unitPrice: "48000" },
      { rawMaterialId: materials["RM-012"]!, quantity: "30", unit: "KG", unitPrice: "22000" },
      { rawMaterialId: materials["RM-011"]!, quantity: "300", unit: "PCS", unitPrice: "900" },
    ],
  });

  await postPurchase({
    date: daysAgo(2),
    supplierId: supplier.id,
    paymentMethod: "BANK",
    note: "Гурилын үнэ дахин өссөн",
    userId: manager.id,
    items: [{ rawMaterialId: materials["RM-001"]!, quantity: "80", unit: "KG", unitPrice: "3350" }],
  });

  // --- Өдрийн борлуулалт ---------------------------------------------------
  console.log("Борлуулалт бүртгэж байна...");
  const salesPlan = [
    { day: 5, pizza: 18, latte: 30, americano: 22, cake: 1 },
    { day: 4, pizza: 22, latte: 35, americano: 28, cake: 2 },
    { day: 3, pizza: 15, latte: 28, americano: 20, cake: 1 },
    { day: 2, pizza: 20, latte: 33, americano: 25, cake: 2 },
    { day: 1, pizza: 24, latte: 40, americano: 30, cake: 3 },
    { day: 0, pizza: 20, latte: 35, americano: 26, cake: 2 },
  ];

  for (const plan of salesPlan) {
    const items = [
      { productId: chickenPizza.id, quantity: String(plan.pizza), unitPrice: "35000" },
      { productId: latte.id, quantity: String(plan.latte), unitPrice: "9000" },
      { productId: americano.id, quantity: String(plan.americano), unitPrice: "7500" },
      { productId: cake.id, quantity: String(plan.cake), unitPrice: "85000" },
    ];
    const revenue =
      plan.pizza * 35000 + plan.latte * 9000 + plan.americano * 7500 + plan.cake * 85000;

    // Ойролцоогоор 25% бэлэн, үлдсэн нь карт / QR.
    const cash = Math.round((revenue * 0.25) / 100) * 100;
    const card = Math.round((revenue * 0.5) / 100) * 100;
    const qr = revenue - cash - card;

    await postSalesBatch({
      date: daysAgo(plan.day),
      items,
      payments: { cash, card, qr, bankTransfer: 0, other: 0 },
      userId: manager.id,
    });
  }

  // --- Зардал --------------------------------------------------------------
  console.log("Зардал бүртгэж байна...");
  const expenseData: { day: number; category: string; amount: string; account: "CASH" | "BANK"; description: string }[] = [
    { day: 10, category: "Түлш", amount: "180000", account: "CASH", description: "Хүргэлтийн машин" },
    { day: 8, category: "Ашиглалтын төлбөр", amount: "450000", account: "BANK", description: "Цахилгаан, ус" },
    { day: 5, category: "Засвар", amount: "260000", account: "CASH", description: "Зуухны засвар" },
    { day: 3, category: "Цэвэрлэгээ", amount: "90000", account: "CASH", description: "Цэвэрлэгээний хэрэгсэл" },
    { day: 1, category: "Хүргэлтийн зардал", amount: "120000", account: "CASH", description: "Хотын доторх хүргэлт" },
    { day: 0, category: "Бичиг хэрэг", amount: "45000", account: "CASH", description: "Принтерийн цаас" },
  ];

  for (const expense of expenseData) {
    const category = expenseCategories.find((c) => c.name === expense.category);
    if (!category) continue;
    await postExpense({
      date: daysAgo(expense.day),
      categoryId: category.id,
      amount: expense.amount,
      account: expense.account,
      description: expense.description,
      userId: manager.id,
    });
  }

  // --- Банкны тушаалт ------------------------------------------------------
  console.log("Банкны тушаалт бүртгэж байна...");
  for (const day of [4, 3, 2]) {
    const batches = await prisma.saleBatch.findMany({
      where: { status: "POSTED", date: daysAgo(day + 1) },
      select: { cashAmount: true },
    });
    const total = batches.reduce((acc, b) => acc + Number(b.cashAmount), 0);
    if (total > 0) {
      await postBankDeposit({
        amount: String(total),
        date: daysAgo(day),
        note: "Өмнөх өдрийн бэлэн орлого",
        userId: manager.id,
      });
    }
  }

  // --- Тооллого ------------------------------------------------------------
  console.log("Тооллого бүртгэж байна...");
  const { createInventoryCount, saveCountLines, finalizeInventoryCount } = await import(
    "../src/server/services/counts"
  );
  const countTargets = ["RM-001", "RM-003", "RM-004", "RM-005", "RM-006"];
  const count = await createInventoryCount({
    date: daysAgo(1),
    note: "Долоо хоногийн тооллого",
    rawMaterialIds: countTargets.map((sku) => materials[sku]!),
    userId: manager.id,
  });

  const countedMaterials = await prisma.rawMaterial.findMany({
    where: { id: { in: countTargets.map((sku) => materials[sku]!) } },
  });
  await saveCountLines({
    countId: count.id,
    userId: manager.id,
    lines: countedMaterials.map((material, index) => {
      // Хэдэн материалд бага зэргийн дутагдал үүсгэж жишээ болгоно.
      const shrink = index === 1 ? 2.7 : index === 3 ? 1.5 : 0;
      const counted = Math.max(Number(material.quantity) - shrink, 0);
      return { rawMaterialId: material.id, countedQuantity: counted.toFixed(3) };
    }),
  });
  await finalizeInventoryCount({ countId: count.id, userId: manager.id });

  console.log("\nЖишээ өгөгдөл бэлэн боллоо.");
  console.log(`  Эзэн:     ${owner.email} / Password123!`);
  console.log(`  Менежер:  ${manager.email} / Password123!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
