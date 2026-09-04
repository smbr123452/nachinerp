import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Нэгдсэн хайрцгийн систем: цагаан дэвсгэр, зөөлөн хүрээ, багавтар сүүдэр.
 */
export function Card({
  className,
  children,
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cn(
        "min-w-0 overflow-hidden rounded-card border border-ink-200 bg-white shadow-card",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink-200 px-5 py-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-title font-semibold leading-6 text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-body text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="no-print flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("border-t border-ink-200 bg-ink-50/60 px-5 py-3.5", className)}>{children}</div>
  );
}
