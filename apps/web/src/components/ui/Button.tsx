"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost" | "link";
type Size = "sm" | "md" | "lg" | "icon";

/**
 * Товчны шатлал:
 *  primary   — хуудасны гол үйлдэл (баталгаажуулах, хадгалах)
 *  secondary — хоёрдогч үйлдэл
 *  danger    — эргэлт буцалтгүй үйлдлийг НЭЭХ товч (зөөлөн улаан)
 *  dangerSolid — баталгаажуулалтын эцсийн устгах / цуцлах товч. Зөвхөн
 *                баталгаажуулах модалын гол үйлдэлд — хуудсан дээр
 *                тарааж хэрэглэвэл улаан өнгө утгаа алдана.
 *  ghost     — жижиг, ач холбогдол багатай үйлдэл
 */
const VARIANTS: Record<Variant, string> = {
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

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-[15px]",
  icon: "h-9 w-9",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Текстийн өмнөх дүрс. */
  icon?: ReactNode;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", icon, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed",
        variant === "link" && "h-auto rounded-sm px-0",
        variant !== "link" && SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
      ) : icon ? (
        <span aria-hidden className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});

/**
 * Форм илгээх товч — илгээж байх үед автоматаар түгжигдэж,
 * ачаалж буйг харуулна (хоёр дахин илгээхээс сэргийлнэ).
 */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
