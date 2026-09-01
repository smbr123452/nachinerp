import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyRow, Table, Td, Th } from "@/components/ui/Table";
import { requirePageOwner } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { allowNegativeStock, getSetting, SETTING_KEYS } from "@/server/services/settings";
import { EditUserButton, NewUserButton } from "./SettingsClient";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Тохиргоо | Начин ERP" };

export default async function SettingsPage() {
  await requirePageOwner();

  const [users, companyName, allowNegative] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    getSetting(SETTING_KEYS.COMPANY_NAME),
    allowNegativeStock(),
  ]);

  return (
    <>
      <PageHeader title="Тохиргоо" description="Зөвхөн эзэн хандах хэсэг" />

      <Card className="mb-6">
        <CardHeader title="Системийн тохиргоо" />
        <CardBody>
          <SettingsForm companyName={companyName} allowNegativeStock={allowNegative} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Хэрэглэгчид" action={<NewUserButton />} />
        <Table>
          <thead>
            <tr>
              <Th>Нэр</Th>
              <Th>И-мэйл</Th>
              <Th>Эрх</Th>
              <Th>Төлөв</Th>
              <Th>Үүсгэсэн</Th>
              <Th align="right">Үйлдэл</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <EmptyRow colSpan={6} />
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <Td className="font-medium">{user.name}</Td>
                  <Td className="text-slate-500">{user.email}</Td>
                  <Td>
                    <Badge tone={user.role === "OWNER" ? "info" : "neutral"}>{ROLE_LABEL[user.role]}</Badge>
                  </Td>
                  <Td>
                    {user.isActive ? (
                      <Badge tone="success">Идэвхтэй</Badge>
                    ) : (
                      <Badge tone="danger">Идэвхгүй</Badge>
                    )}
                  </Td>
                  <Td className="text-slate-500">{formatDate(user.createdAt)}</Td>
                  <Td align="right">
                    <EditUserButton
                      user={{
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        isActive: user.isActive,
                      }}
                    />
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
