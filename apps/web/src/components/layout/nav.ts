import type { Role } from "@prisma/client";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardCheck,
  Croissant,
  FileBarChart,
  History,
  LayoutDashboard,
  Receipt,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Хоосон бол бүх дүрд харагдана. */
  roles?: Role[];
};

export type NavGroup = {
  /** Бүлгийн гарчиг — эхний бүлэгт шаардлагагүй. */
  label?: string;
  items: NavItem[];
};

/** Үндсэн цэс — энгийн байлгах үүднээс цөөн бүлэгт хуваасан. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/dashboard", label: "Хянах самбар", icon: LayoutDashboard }],
  },
  {
    label: "Үйл ажиллагаа",
    items: [
      { href: "/materials", label: "Бараа материал", icon: Boxes },
      { href: "/products", label: "Бүтээгдэхүүн", icon: Croissant },
      { href: "/purchases", label: "Худалдан авалт", icon: ArrowDownToLine },
      { href: "/sales", label: "Борлуулалт", icon: ArrowUpFromLine },
      { href: "/expenses", label: "Зардал", icon: Receipt },
      { href: "/counts", label: "Тооллого", icon: ClipboardCheck },
      { href: "/money", label: "Мөнгө", icon: Wallet },
    ],
  },
  {
    label: "Хяналт",
    items: [
      { href: "/reports", label: "Тайлан", icon: FileBarChart },
      { href: "/audit", label: "Audit log", icon: History },
      { href: "/settings", label: "Тохиргоо", icon: Settings, roles: ["OWNER"] },
    ],
  },
];

/** Дүрд харагдах цэсийг шүүнэ (хоосон болсон бүлгийг хасна). */
export function visibleNavGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/** Идэвхтэй замд тохирох цэсийн гарчгийг олно (толгой мөрөнд). */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV_GROUPS.flatMap((group) => group.items);
  return all.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
