"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/cn";
import { visibleNavItems } from "./nav";

export function Sidebar({
  role,
  userName,
  roleLabel,
  companyName,
}: {
  role: Role;
  userName: string;
  roleLabel: string;
  companyName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = visibleNavItems(role);

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <span aria-hidden className="w-5 text-center text-base">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Гар утасны толгой мөр */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="font-semibold text-slate-900">{companyName}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          aria-expanded={open}
        >
          {open ? "Хаах" : "Цэс"}
        </button>
      </div>

      <aside
        className={cn(
          "border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r",
          open ? "block border-b" : "hidden lg:block",
        )}
      >
        <div className="hidden border-b border-slate-200 px-5 py-4 lg:block">
          <p className="text-base font-semibold text-slate-900">{companyName}</p>
          <p className="text-xs text-slate-500">Удирдлагын систем</p>
        </div>
        {nav}
        <div className="mt-auto hidden border-t border-slate-200 px-5 py-4 lg:block">
          <p className="text-sm font-medium text-slate-800">{userName}</p>
          <p className="text-xs text-slate-500">{roleLabel}</p>
        </div>
      </aside>
    </>
  );
}
