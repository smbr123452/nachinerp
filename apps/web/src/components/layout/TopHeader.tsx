import type { Role } from "@prisma/client";
import { RoleBadge } from "@/components/ui/Badge";

/**
 * Ширээний толгой мөр — нэвтэрсэн хэрэглэгч, эрхийг харуулна.
 * Санаатайгаар сервер компонент: хуудасны замыг сонсох клиент бүрдэл
 * нэмбэл server action-ы redirect-тэй мөргөлдөх эрсдэлтэй.
 */
export function TopHeader({
  userName,
  roleLabel,
  role,
  title,
}: {
  userName: string;
  roleLabel: string;
  role: Role;
  title?: string;
}) {
  return (
    <header className="no-print sticky top-0 z-20 hidden border-b border-ink-200 bg-white/85 backdrop-blur lg:block">
      <div className="flex h-14 items-center justify-between gap-4 px-6 xl:px-8">
        <span className="truncate text-sm font-semibold text-ink-800">{title}</span>
        <div className="flex shrink-0 items-center gap-3">
          <RoleBadge role={role} label={roleLabel} />
          <span className="text-sm font-medium text-ink-700">{userName}</span>
        </div>
      </div>
    </header>
  );
}
