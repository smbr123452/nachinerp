import type { Role } from "@prisma/client";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Хоосон бол бүх дүрд харагдана. */
  roles?: Role[];
};

/** Үндсэн цэс — энгийн байлгах үүднээс 10 цэгээс хэтрүүлэхгүй. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Хянах самбар", icon: "▦" },
  { href: "/materials", label: "Бараа материал", icon: "▤" },
  { href: "/products", label: "Бүтээгдэхүүн", icon: "◍" },
  { href: "/purchases", label: "Худалдан авалт", icon: "⇥" },
  { href: "/sales", label: "Борлуулалт", icon: "⇤" },
  { href: "/expenses", label: "Зардал", icon: "▾" },
  { href: "/counts", label: "Тооллого", icon: "☑" },
  { href: "/money", label: "Мөнгө", icon: "₮" },
  { href: "/reports", label: "Тайлан", icon: "▥" },
  { href: "/audit", label: "Audit Log", icon: "⏱" },
];

export const OWNER_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Тохиргоо", icon: "⚙", roles: ["OWNER"] },
];

export function visibleNavItems(role: Role): NavItem[] {
  return [...NAV_ITEMS, ...OWNER_NAV_ITEMS].filter(
    (item) => !item.roles || item.roles.includes(role),
  );
}
