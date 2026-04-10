import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";
import { addStockLedgerAndUpdateBalance } from "@/core/inventory/stock";

type LoadItemInput = { productId: string; qty: number };
type DeliverItemInput = { productId: string; qty: number };
type ReturnLossInput = { productId: string; returnedQty: number; lossQty: number };

function dec(n: unknown): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export async function GET() {
  const auth = await requirePermission("route.read");
  if (auth instanceof NextResponse) return auth;

  const [runs, routes, products] = await Promise.all([
    prisma.deliveryRun.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        route: { include: { sourceWarehouse: { include: { branch: true } }, stops: { include: { branch: true }, orderBy: { stopOrder: "asc" } } } },
        items: { include: { product: true } },
        deliveries: { include: { branch: true, items: { include: { product: true } } }, orderBy: { confirmedAt: "asc" } },
      },
      take: 100,
    }),
    prisma.deliveryRoute.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { sourceWarehouse: true, stops: true } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ runs, routes, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("route.run.create");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const routeId = String(body.routeId ?? "").trim();
  const runDate = String(body.runDate ?? "").trim();
  const note = body.note ? String(body.note).trim() : null;
  if (!routeId || !runDate) return NextResponse.json({ message: "routeId болон runDate шаардлагатай." }, { status: 400 });

  const route = await prisma.deliveryRoute.findUnique({ where: { id: routeId } });
  if (!route || !route.isActive) return NextResponse.json({ message: "Маршрут олдсонгүй." }, { status: 404 });

  const runNo = `RUN-${Date.now()}`;
  const created = await prisma.deliveryRun.create({
    data: {
      runNo,
      routeId,
      runDate: new Date(`${runDate}T00:00:00`),
      note,
      createdById: auth.user.id,
    },
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "route.run",
    action: "create",
    entityType: "DeliveryRun",
    entityId: created.id,
    afterData: { routeId, runDate, note },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Хүргэлтийн run үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const runId = String(body.runId ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!runId || !action) return NextResponse.json({ message: "runId болон action шаардлагатай." }, { status: 400 });

  const run = await prisma.deliveryRun.findUnique({
    where: { id: runId },
    include: { route: { include: { sourceWarehouse: true, stops: true } }, items: true },
  });
  if (!run) return NextResponse.json({ message: "Run олдсонгүй." }, { status: 404 });

  if (action === "load") {
    const auth = await requirePermission("route.run.load");
    if (auth instanceof NextResponse) return auth;
    if (run.status !== "DRAFT") return NextResponse.json({ message: "Зөвхөн DRAFT run-д ачаална." }, { status: 400 });

    const items = (Array.isArray(body.items) ? body.items : []) as LoadItemInput[];
    if (items.length === 0) return NextResponse.json({ message: "Ачаалалтын мөр оруулна уу." }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (!item.productId || dec(item.qty) <= 0) throw new Error("INVALID_LOAD_ITEM");

        await tx.deliveryRunItem.upsert({
          where: { runId_productId: { runId: run.id, productId: item.productId } },
          update: { loadedQty: dec(item.qty) },
          create: { runId: run.id, productId: item.productId, loadedQty: dec(item.qty) },
        });

        await addStockLedgerAndUpdateBalance(tx, {
          txnType: "ROUTE_LOAD_OUT",
          warehouseId: run.route.sourceWarehouseId,
          branchId: run.route.sourceWarehouse.branchId,
          productId: item.productId,
          qtyIn: 0,
          qtyOut: dec(item.qty),
          refType: "DELIVERY_RUN",
          refId: run.id,
          note: run.note,
          createdById: auth.user.id,
        });
      }

      await tx.deliveryRun.update({
        where: { id: run.id },
        data: { status: "LOADED", loadedAt: new Date() },
      });
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "route.run",
      action: "load",
      entityType: "DeliveryRun",
      entityId: run.id,
      afterData: { items },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Ачаалалт амжилттай." });
  }

  if (action === "deliver") {
    const auth = await requirePermission("route.run.deliver");
    if (auth instanceof NextResponse) return auth;
    if (!(run.status === "LOADED" || run.status === "IN_PROGRESS")) {
      return NextResponse.json({ message: "Run нь LOADED эсвэл IN_PROGRESS байх ёстой." }, { status: 400 });
    }

    const branchId = String(body.branchId ?? "").trim();
    const note = body.note ? String(body.note).trim() : null;
    const items = (Array.isArray(body.items) ? body.items : []) as DeliverItemInput[];
    if (!branchId || items.length === 0) return NextResponse.json({ message: "Хүргэлтийн мэдээлэл дутуу байна." }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const conf = await tx.deliveryConfirmation.create({
        data: { runId: run.id, branchId, note, confirmedById: auth.user.id },
      });

      for (const item of items) {
        if (!item.productId || dec(item.qty) <= 0) throw new Error("INVALID_DELIVERY_ITEM");
        const runItem = await tx.deliveryRunItem.findUnique({
          where: { runId_productId: { runId: run.id, productId: item.productId } },
        });
        if (!runItem) throw new Error("RUN_ITEM_NOT_FOUND");

        const newDelivered = Number(runItem.deliveredQty) + dec(item.qty);
        if (newDelivered > Number(runItem.loadedQty)) throw new Error("DELIVERY_EXCEEDS_LOAD");

        await tx.deliveryRunItem.update({
          where: { id: runItem.id },
          data: { deliveredQty: newDelivered },
        });

        await tx.deliveryConfirmationItem.create({
          data: { confirmationId: conf.id, productId: item.productId, qty: dec(item.qty) },
        });
      }

      if (run.status === "LOADED") {
        await tx.deliveryRun.update({ where: { id: run.id }, data: { status: "IN_PROGRESS" } });
      }
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "route.run",
      action: "deliver_confirm",
      entityType: "DeliveryRun",
      entityId: run.id,
      afterData: { branchId, items },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Хүргэлт баталгаажлаа." });
  }

  if (action === "return_loss") {
    const auth = await requirePermission("route.run.return_loss");
    if (auth instanceof NextResponse) return auth;
    if (!(run.status === "LOADED" || run.status === "IN_PROGRESS")) {
      return NextResponse.json({ message: "Run нь LOADED эсвэл IN_PROGRESS байх ёстой." }, { status: 400 });
    }

    const items = (Array.isArray(body.items) ? body.items : []) as ReturnLossInput[];
    if (items.length === 0) return NextResponse.json({ message: "Буцаалт/хорогдлын мөр оруулна уу." }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const runItem = await tx.deliveryRunItem.findUnique({
          where: { runId_productId: { runId: run.id, productId: item.productId } },
        });
        if (!runItem) throw new Error("RUN_ITEM_NOT_FOUND");

        const returnedQty = dec(item.returnedQty);
        const lossQty = dec(item.lossQty);
        const deliveredQty = Number(runItem.deliveredQty);
        const loadedQty = Number(runItem.loadedQty);

        if (deliveredQty + returnedQty + lossQty > loadedQty) {
          throw new Error("BALANCE_EXCEEDED");
        }

        await tx.deliveryRunItem.update({
          where: { id: runItem.id },
          data: { returnedQty, lossQty },
        });
      }
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "route.run",
      action: "return_loss_record",
      entityType: "DeliveryRun",
      entityId: run.id,
      afterData: { items },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Буцаалт/хорогдол хадгалагдлаа." });
  }

  if (action === "close") {
    const auth = await requirePermission("route.run.close");
    if (auth instanceof NextResponse) return auth;
    if (!(run.status === "LOADED" || run.status === "IN_PROGRESS")) {
      return NextResponse.json({ message: "Зөвхөн LOADED эсвэл IN_PROGRESS run-г хаана." }, { status: 400 });
    }

    const items = await prisma.deliveryRunItem.findMany({ where: { runId: run.id } });
    if (items.length === 0) return NextResponse.json({ message: "Run дээр ачаалалт байхгүй." }, { status: 400 });

    for (const item of items) {
      const loaded = Number(item.loadedQty);
      const delivered = Number(item.deliveredQty);
      const returned = Number(item.returnedQty);
      const loss = Number(item.lossQty);
      const diff = Math.abs(loaded - (delivered + returned + loss));
      if (diff > 0.0001) {
        return NextResponse.json({ message: "Run хаах боломжгүй: load = delivered + returned + loss нөхцөл хангагдсангүй." }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const returned = Number(item.returnedQty);
        if (returned > 0) {
          await addStockLedgerAndUpdateBalance(tx, {
            txnType: "ROUTE_RETURN_IN",
            warehouseId: run.route.sourceWarehouseId,
            branchId: run.route.sourceWarehouse.branchId,
            productId: item.productId,
            qtyIn: returned,
            qtyOut: 0,
            refType: "DELIVERY_RUN_CLOSE",
            refId: run.id,
            note: run.note,
            createdById: auth.user.id,
          });
        }
      }

      await tx.deliveryRun.update({
        where: { id: run.id },
        data: { status: "CLOSED", closedById: auth.user.id, closedAt: new Date() },
      });
    });

    await writeAuditLog({
      actorUserId: auth.user.id,
      module: "route.run",
      action: "close",
      entityType: "DeliveryRun",
      entityId: run.id,
      afterData: {
        totals: items.map((x) => ({
          productId: x.productId,
          loadedQty: x.loadedQty,
          deliveredQty: x.deliveredQty,
          returnedQty: x.returnedQty,
          lossQty: x.lossQty,
        })),
      },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Run амжилттай хаагдлаа." });
  }

  return NextResponse.json({ message: "action буруу байна." }, { status: 400 });
}

