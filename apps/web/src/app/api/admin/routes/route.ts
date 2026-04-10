import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/core/db/prisma";
import { requirePermission } from "@/core/auth/rbac";
import { writeAuditLog } from "@/core/audit/audit";

type StopInput = { branchId: string; stopOrder: number };

export async function GET() {
  const auth = await requirePermission("route.read");
  if (auth instanceof NextResponse) return auth;

  const [routes, warehouses, branches] = await Promise.all([
    prisma.deliveryRoute.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sourceWarehouse: { include: { branch: true } },
        stops: { include: { branch: true }, orderBy: { stopOrder: "asc" } },
      },
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" }, include: { branch: true } }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { nameMn: "asc" } }),
  ]);

  return NextResponse.json({ routes, warehouses, branches });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("route.manage");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  const nameMn = String(body.nameMn ?? "").trim();
  const sourceWarehouseId = String(body.sourceWarehouseId ?? "").trim();
  const stops = (Array.isArray(body.stops) ? body.stops : []) as StopInput[];

  if (!code || !nameMn || !sourceWarehouseId || stops.length === 0) {
    return NextResponse.json({ message: "Маршрутын мэдээлэл дутуу байна." }, { status: 400 });
  }

  const exists = await prisma.deliveryRoute.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json({ message: "Маршрутын код давхцаж байна." }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const route = await tx.deliveryRoute.create({
      data: { code, nameMn, sourceWarehouseId, isActive: true },
    });
    await tx.deliveryRouteStop.createMany({
      data: stops.map((s) => ({ routeId: route.id, branchId: s.branchId, stopOrder: s.stopOrder })),
    });
    return route;
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "route",
    action: "create",
    entityType: "DeliveryRoute",
    entityId: created.id,
    afterData: { code, nameMn, sourceWarehouseId, stops },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Маршрут амжилттай үүслээ." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("route.manage");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const routeId = String(body.routeId ?? "").trim();
  const nameMn = body.nameMn !== undefined ? String(body.nameMn).trim() : undefined;
  const sourceWarehouseId = body.sourceWarehouseId !== undefined ? String(body.sourceWarehouseId).trim() : undefined;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;
  const stops = Array.isArray(body.stops) ? (body.stops as StopInput[]) : undefined;

  if (!routeId) return NextResponse.json({ message: "routeId шаардлагатай." }, { status: 400 });

  const before = await prisma.deliveryRoute.findUnique({
    where: { id: routeId },
    include: { stops: true },
  });
  if (!before) return NextResponse.json({ message: "Маршрут олдсонгүй." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.deliveryRoute.update({
      where: { id: routeId },
      data: {
        nameMn: nameMn && nameMn.length > 0 ? nameMn : undefined,
        sourceWarehouseId: sourceWarehouseId && sourceWarehouseId.length > 0 ? sourceWarehouseId : undefined,
        isActive: isActive ?? undefined,
      },
    });
    if (stops) {
      await tx.deliveryRouteStop.deleteMany({ where: { routeId } });
      if (stops.length > 0) {
        await tx.deliveryRouteStop.createMany({
          data: stops.map((s) => ({ routeId, branchId: s.branchId, stopOrder: s.stopOrder })),
        });
      }
    }
  });

  await writeAuditLog({
    actorUserId: auth.user.id,
    module: "route",
    action: "update",
    entityType: "DeliveryRoute",
    entityId: routeId,
    beforeData: before,
    afterData: { nameMn, sourceWarehouseId, isActive, stops },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Маршрут шинэчлэгдлээ." });
}

