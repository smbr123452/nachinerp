import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting, SETTING_KEYS } from "@/server/services/settings";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Нэвтрэх | Начин ERP" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const companyName = await getSetting(SETTING_KEYS.COMPANY_NAME);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{companyName}</h1>
          <p className="mt-1 text-sm text-slate-500">Удирдлагын системд нэвтрэх</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
