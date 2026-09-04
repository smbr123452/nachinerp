import { cn } from "@/lib/cn";

/**
 * Товчны хэв маягийн жор.
 *
 * ЭНЭ ФАЙЛ "use client" БИШ: холбоосыг товч шиг харуулах хэрэгцээ сервер
 * компонентод ч гардаг (жишээ нь `not-found.tsx`). Хэв маягийг Button.tsx
 * дотор үлдээвэл сервер талаас дуудаж болохгүй болно.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "dangerSolid"
  | "ghost"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

/**
 * Товчны шатлал:
 *  primary     — хуудасны гол үйлдэл (баталгаажуулах, хадгалах)
 *  secondary   — хоёрдогч үйлдэл
 *  danger      — эргэлт буцалтгүй үйлдлийг НЭЭХ товч (зөөлөн улаан)
 *  dangerSolid — баталгаажуулалтын эцсийн устгах / цуцлах товч. Зөвхөн
 *                баталгаажуулах модалын гол үйлдэлд — хуудсан дээр
 *                тарааж хэрэглэвэл улаан өнгө утгаа алдана.
 *  ghost       — жижиг, ач холбогдол багатай үйлдэл
 *  link        — текстэн холбоос
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 " +
    "disabled:bg-brand-300 disabled:shadow-none",
  secondary:
    "border border-ink-300 bg-white text-ink-700 shadow-sm hover:border-ink-400 hover:bg-ink-50 " +
    "active:bg-ink-100 disabled:border-ink-200 disabled:text-ink-400 disabled:shadow-none",
  danger:
    "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 " +
    "active:bg-red-200 disabled:border-red-100 disabled:text-red-300",
  dangerSolid:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 " +
    "disabled:bg-red-300 disabled:shadow-none",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 disabled:text-ink-300",
  link: "text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline disabled:text-ink-400",
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-body",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-title",
  icon: "h-9 w-9",
};

/**
 * Товчны ангиллын мөрийг угсарна. Холбоос (`<a>`) товч шиг харагдах
 * шаардлагатай үед ЭНЭ функцийг дуудна — ангиллыг гараар хуулбарлавал
 * хэв маяг салж эхэлдэг.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium",
    "transition-colors duration-150 disabled:cursor-not-allowed",
    variant === "link" && "h-auto rounded-sm px-0",
    variant !== "link" && BUTTON_SIZES[size],
    BUTTON_VARIANTS[variant],
    className,
  );
}
