import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Minimal seed to unblock local development:
  // - creates a Super Admin role
  // - creates a small permission set
  // - creates an initial admin user (admin / admin123) for local use

  const perms = [
    { code: "admin.users.read", module: "admin.users", action: "read", description: "Хэрэглэгч харах" },
    { code: "admin.users.write", module: "admin.users", action: "write", description: "Хэрэглэгч удирдах" },
    { code: "admin.roles.read", module: "admin.roles", action: "read", description: "Эрхийн бүлэг харах" },
    { code: "admin.roles.write", module: "admin.roles", action: "write", description: "Эрхийн бүлэг удирдах" },
    { code: "admin.masterdata.read", module: "admin.masterdata", action: "read", description: "Мастер дата харах" },
    { code: "admin.masterdata.write", module: "admin.masterdata", action: "write", description: "Мастер дата удирдах" },
    { code: "inventory.receiving.create", module: "inventory.receiving", action: "create", description: "Орлого бүртгэх" },
    { code: "inventory.ledger.read", module: "inventory.ledger", action: "read", description: "Хөдөлгөөний түүх харах" },
    { code: "inventory.balances.read", module: "inventory.balances", action: "read", description: "Үлдэгдэл харах" },
    { code: "inventory.transfer.create", module: "inventory.transfer", action: "create", description: "Шилжүүлэг үүсгэх" },
    { code: "inventory.transfer.approve", module: "inventory.transfer", action: "approve", description: "Шилжүүлэг батлах" },
    { code: "inventory.transfer.receive", module: "inventory.transfer", action: "receive", description: "Шилжүүлэг хүлээн авах" },
    { code: "inventory.count.create", module: "inventory.count", action: "create", description: "Тооллого үүсгэх" },
    { code: "inventory.count.submit", module: "inventory.count", action: "submit", description: "Тооллого илгээх" },
    { code: "inventory.count.approve", module: "inventory.count", action: "approve", description: "Тооллого батлах" },
    { code: "inventory.adjustment.read", module: "inventory.adjustment", action: "read", description: "Тохируулга харах" },
    { code: "inventory.adjustment.approve", module: "inventory.adjustment", action: "approve", description: "Тохируулга батлах" },
    { code: "production.recipe.read", module: "production.recipe", action: "read", description: "Жор харах" },
    { code: "production.recipe.write", module: "production.recipe", action: "write", description: "Жор удирдах" },
    { code: "production.order.read", module: "production.order", action: "read", description: "Үйлдвэрлэлийн захиалга харах" },
    { code: "production.order.create", module: "production.order", action: "create", description: "Үйлдвэрлэлийн захиалга үүсгэх" },
    { code: "production.order.approve", module: "production.order", action: "approve", description: "Үйлдвэрлэлийн захиалга батлах" },
    { code: "production.order.execute", module: "production.order", action: "execute", description: "Үйлдвэрлэлийн захиалга гүйцэтгэх" },
    { code: "pos.import.read", module: "pos.import", action: "read", description: "POS импорт харах" },
    { code: "pos.import.run", module: "pos.import", action: "run", description: "POS Excel импорт ажиллуулах" },
    { code: "pos.mapping.read", module: "pos.mapping", action: "read", description: "POS mapping харах" },
    { code: "pos.mapping.write", module: "pos.mapping", action: "write", description: "POS mapping удирдах" },
    { code: "route.read", module: "route", action: "read", description: "Маршрут харах" },
    { code: "route.manage", module: "route", action: "manage", description: "Маршрут удирдах" },
    { code: "route.run.create", module: "route.run", action: "create", description: "Хүргэлтийн run үүсгэх" },
    { code: "route.run.load", module: "route.run", action: "load", description: "Ачаалалт бүртгэх" },
    { code: "route.run.deliver", module: "route.run", action: "deliver", description: "Хүргэлт баталгаажуулах" },
    { code: "route.run.return_loss", module: "route.run", action: "return_loss", description: "Буцаалт/хорогдол бүртгэх" },
    { code: "route.run.close", module: "route.run", action: "close", description: "Маршрут хаах" },
  ] as const;

  for (const p of perms) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {
        module: p.module,
        action: p.action,
        description: p.description,
      },
      create: p,
    });
  }

  const superAdminRole = await prisma.role.upsert({
    where: { code: "SUPER_ADMIN" },
    update: { nameMn: "Супер админ" },
    create: { code: "SUPER_ADMIN", nameMn: "Супер админ" },
  });

  const allPermissions = await prisma.permission.findMany({ select: { id: true } });
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  const passwordHash = await bcrypt.hash("admin123", 12);

  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: { fullName: "Админ", isActive: true, passwordHash },
    create: {
      username: "admin",
      fullName: "Админ",
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { id: `${adminUser.id}:${superAdminRole.id}` },
    update: {},
    create: {
      id: `${adminUser.id}:${superAdminRole.id}`,
      userId: adminUser.id,
      roleId: superAdminRole.id,
      scopeType: "GLOBAL",
    },
  });

  await prisma.session.create({
    data: {
      token: `seed-${randomUUID()}`,
      userId: adminUser.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

