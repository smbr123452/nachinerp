import { requirePageUser } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { getSetting, SETTING_KEYS } from "@/server/services/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const companyName = await getSetting(SETTING_KEYS.COMPANY_NAME);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        role={user.role}
        userName={user.name}
        roleLabel={ROLE_LABEL[user.role]}
        companyName={companyName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 hidden items-center justify-end gap-4 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur lg:flex">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
          </div>
          <LogoutButton />
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
