"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { logoutAction } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

/** Хэрэглэгчийн нэр, эрх, гарах товч — цэснээс тусад нь тодруулсан хэсэг. */
export function AccountMenu({
  userName,
  roleLabel,
  role,
}: {
  userName: string;
  roleLabel: string;
  role: Role;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = userName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 rounded-lg border border-ink-200 bg-white p-1.5 shadow-pop">
          <form action={logoutAction}>
            <SubmitButton
              variant="ghost"
              size="sm"
              icon={<LogOut />}
              pendingText="Гарч байна..."
              className="w-full justify-start"
            >
              Системээс гарах
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
          open ? "bg-ink-100" : "hover:bg-ink-100",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            role === "OWNER" ? "bg-brand-100 text-brand-700" : "bg-ink-200 text-ink-600",
          )}
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium leading-5 text-ink-800">
            {userName}
          </span>
          <span className="block text-meta leading-4 text-ink-500">{roleLabel}</span>
        </span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
      </button>
    </div>
  );
}
