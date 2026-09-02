import { requirePageUser } from "@/lib/auth/guards";
import { parseRangeKey } from "@/server/services/dashboard";
import { OwnerDashboard } from "./OwnerDashboard";
import { ManagerDashboard } from "./ManagerDashboard";

export const metadata = { title: "Хянах самбар" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ range?: string; metric?: string }>;

/**
 * Хянах самбарыг эрхээр нь салгаж рендэрлэнэ.
 * Эзний нууцлалтай өгөгдөл менежерийн хүсэлтэд огт УНШИГДАХГҮЙ —
 * харгалзах нэгтгэлийн функц бүр сервер талдаа эрхээ дахин шалгана.
 */
export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;

  if (user.role === "OWNER") {
    return (
      <OwnerDashboard
        userName={user.name}
        rangeKey={parseRangeKey(params.range)}
        metric={params.metric}
      />
    );
  }

  return <ManagerDashboard userName={user.name} />;
}
