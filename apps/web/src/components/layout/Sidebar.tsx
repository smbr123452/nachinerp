"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { visibleNavGroups } from "./nav";
import { AccountMenu } from "./AccountMenu";
import { SiriusAurumLockup } from "@/components/brand/SiriusAurumLockup";

export function Sidebar({
  role,
  userName,
  roleLabel,
}: {
  role: Role;
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = visibleNavGroups(role);

  // Товч брэнд блок. Цэсний өндрийг идэхгүйгээр таних тэмдэг болно.
  const brand = <SiriusAurumLockup size="sm" />;

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // Хуудас бүр сервер дээр динамикаар бэлтгэгддэг тул урьдчилан
                    // татахгүй: цэсний 11 холбоос бүрийг татвал дашбоардын
                    // тооцоолол дэмий давтагдаж, шилжилттэй мөргөлдөнө.
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {active ? (
                      <span aria-hidden className="ml-auto h-4 w-1 rounded-full bg-brand-600" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Гар утас / таблетын толгой мөр */}
      <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-2.5 lg:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Цэс хаах" : "Цэс нээх"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-300 text-ink-600 transition-colors hover:bg-ink-50"
        >
          {open ? <X aria-hidden className="h-4 w-4" /> : <Menu aria-hidden className="h-4 w-4" />}
        </button>
      </div>

      {open ? (
        <button
          type="button"
          aria-label="Цэс хаах"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink-900/20 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "no-print z-30 flex flex-col border-ink-200 bg-white",
          "lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r",
          open
            ? "fixed inset-y-0 left-0 w-72 max-w-[85vw] border-r shadow-pop"
            : "hidden lg:flex",
        )}
      >
        <div className="hidden shrink-0 items-center border-b border-ink-200 px-4 py-3.5 lg:flex">
          {brand}
        </div>

        {open ? (
          <div className="flex shrink-0 items-center justify-between border-b border-ink-200 px-4 py-3.5 lg:hidden">
            {brand}
          </div>
        ) : null}

        {nav}

        <div className="shrink-0 border-t border-ink-200 p-3">
          <AccountMenu userName={userName} roleLabel={roleLabel} role={role} />
        </div>
      </aside>
    </>
  );
}
