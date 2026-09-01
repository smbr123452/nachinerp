import { requirePageUser } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { getSetting, SETTING_KEYS } from "@/server/services/settings";

/** Апп-ын бүрхүүл: зүүн цэс + толгой мөр + агуулгын хэсэг. */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const companyName = await getSetting(SETTING_KEYS.COMPANY_NAME);
  const roleLabel = ROLE_LABEL[user.role];

  return (
    <div className="flex min-h-screen flex-col bg-ink-50 lg:flex-row">
      <Sidebar
        role={user.role}
        userName={user.name}
        roleLabel={roleLabel}
        companyName={companyName}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader userName={user.name} roleLabel={roleLabel} role={user.role} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
