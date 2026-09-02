import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Align = "left" | "right" | "center";

const ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "tabular whitespace-nowrap text-right",
  center: "text-center",
};

/**
 * Хүснэгтийн нэгдсэн загвар. Өргөн хүснэгт өөрийн хүрээндээ хэвтээ
 * гүйлгэнэ — хуудас өөрөө хэзээ ч хэвтээ гүйлгэхгүй.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="scrollbar-slim w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = "left",
  width,
  stickyRight = false,
}: {
  children?: ReactNode;
  className?: string;
  align?: Align;
  width?: string;
  /** Багана олонтой хүснэгтэд үйлдлийн багана байрандаа үлдэнэ. */
  stickyRight?: boolean;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        "h-9 whitespace-nowrap border-b border-ink-200 bg-ink-50 px-3",
        "text-[11px] font-semibold uppercase tracking-wide text-ink-500",
        stickyRight && "sticky right-0 z-10 border-l border-ink-200 bg-ink-50",
        ALIGN[align],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "left",
  colSpan,
  muted,
  stickyRight = false,
}: {
  children?: ReactNode;
  className?: string;
  align?: Align;
  colSpan?: number;
  muted?: boolean;
  /** Th-ийн stickyRight-тай хамт — үйлдлийн багана гүйлгэхэд харагдсаар байна. */
  stickyRight?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "h-10 border-b border-ink-100 px-3 py-2 align-middle",
        muted ? "text-ink-500" : "text-ink-700",
        stickyRight && "sticky right-0 z-10 border-l border-ink-100 bg-inherit",
        ALIGN[align],
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Мөрийн үндсэн хэв маяг — hover дээр бага зэрэг тодорно. */
export function Tr({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: "warning" | "muted";
}) {
  return (
    <tr
      className={cn(
        // Тодорхой дэвсгэр: наалдсан (sticky) багана нь мөрийнхөө өнгийг
        // өвлөнө — доогуур нь агуулга гүйж харагдахгүй.
        "bg-white transition-colors hover:bg-brand-50/40",
        tone === "warning" && "bg-amber-50/60 hover:bg-amber-50",
        tone === "muted" && "text-ink-400",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Нийлбэр / дүнгийн мөр. */
export function TotalRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("bg-ink-50 font-semibold text-ink-900 [&>td]:border-t [&>td]:border-ink-200", className)}>
      {children}
    </tr>
  );
}

export function EmptyRow({
  colSpan,
  children,
  icon,
}: {
  colSpan: number;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center">
        <div className="flex flex-col items-center gap-2 text-ink-400">
          {icon ? <span aria-hidden className="[&>svg]:h-6 [&>svg]:w-6">{icon}</span> : null}
          <span className="text-sm">{children ?? "Мэдээлэл алга байна."}</span>
        </div>
      </td>
    </tr>
  );
}

/**
 * Мөрийн үйлдлийн нүд. Товчнууд НЭГ эгнээнд, баруун тийш — багана нарийсахад
 * доошоо шидэгдэж мөрийн өндрийг эвдэхгүй.
 */
export function TableActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-0.5 whitespace-nowrap">
      {children}
    </div>
  );
}

/** Хүснэгт доторх холбоос — дарагдахаар нь илэрхий, ижил хэв маягтай. */
export function TableLink({
  href,
  children,
  strong = false,
}: {
  href: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline",
        strong && "font-medium",
      )}
    >
      {children}
    </Link>
  );
}

/** Код / дугаар — тогтмол өргөнтэй фонтоор. */
export function MonoText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-ink-500", className)}>{children}</span>;
}
