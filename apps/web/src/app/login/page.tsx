import { redirect } from "next/navigation";
import { BarChart3, PackageSearch, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting, SETTING_KEYS } from "@/server/services/settings";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Нэвтрэх | Начин ERP" };

const HIGHLIGHTS = [
  {
    icon: PackageSearch,
    title: "Нөөц автоматаар",
    description: "Борлуулалт бүртгэхэд жорын дагуу түүхий эд шууд хасагдана.",
  },
  {
    icon: BarChart3,
    title: "Өртөг үнэн зөв",
    description: "Жигнэсэн дундаж өртгөөр бодит ашгаа өдөр бүр хараарай.",
  },
  {
    icon: ShieldCheck,
    title: "Бүрэн хяналт",
    description: "Чухал үйлдэл бүр аудитын түүхэд өөрчлөгдөшгүй хадгалагдана.",
  },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const companyName = await getSetting(SETTING_KEYS.COMPANY_NAME);

  return (
    <main className="grid min-h-screen bg-ink-50 lg:grid-cols-[1.05fr_1fr]">
      {/* Зүүн тал — брэнд, товч танилцуулга (зөвхөн том дэлгэцэнд) */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-700 px-12 py-14 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-brand-900/40 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-base font-bold backdrop-blur">
            Н
          </span>
          <span>
            <span className="block text-[15px] font-semibold leading-5">{companyName}</span>
            <span className="block text-[12px] leading-4 text-brand-100">Удирдлагын систем</span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[30px] font-semibold leading-10 tracking-[-0.01em]">
            Өдөр тутмын үйл ажиллагаагаа нэг дороос удирдана
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-brand-100">
            Борлуулалт, нөөц, худалдан авалт, зардал, мөнгөн гүйлгээ — бүгд нэг системд,
            бодит өртгийн тооцоотойгоор.
          </p>

          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                  <item.icon aria-hidden className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-5">{item.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-brand-100">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200">
          © {new Date().getFullYear()} {companyName}. Дотоод хэрэглээнд зориулав.
        </p>
      </section>

      {/* Баруун тал — нэвтрэх хэсэг */}
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 text-center lg:hidden">
            <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm">
              Н
            </span>
            <h1 className="text-lg font-semibold text-ink-900">{companyName}</h1>
            <p className="mt-0.5 text-[13px] text-ink-500">Удирдлагын систем</p>
          </div>

          <div className="rounded-card border border-ink-200 bg-white p-6 shadow-card sm:p-7">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-ink-900">Системд нэвтрэх</h2>
              <p className="mt-1 text-[13px] text-ink-500">
                Ажлын и-мэйл хаяг болон нууц үгээ оруулна уу.
              </p>
            </div>
            <LoginForm />
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-ink-400">
            Нэвтрэх эрхтэй холбоотой асуудлыг байгууллагын эзэнтэй шийдвэрлэнэ үү.
          </p>
        </div>
      </section>
    </main>
  );
}
