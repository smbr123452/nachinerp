import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/** Хуудасны гарчиг, тайлбар, гол үйлдлүүд. */
export function PageHeader({
  title,
  description,
  action,
  meta,
  backHref,
  backLabel = "Буцах",
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Гарчгийн доорх төлөв, тэмдэглэгээ. */
  meta?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="no-print mb-2 inline-flex items-center gap-1.5 text-body font-medium text-ink-500 transition-colors hover:text-brand-700"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold leading-8 text-ink-900">{title}</h1>
          {description ? (
            <p className="mt-1 text-body leading-5 text-ink-500">{description}</p>
          ) : null}
          {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {action ? (
          <div className="no-print flex min-w-0 flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Хуудас доторх хэсгийн гарчиг. */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-title font-semibold leading-6 text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-body text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="no-print">{action}</div> : null}
    </div>
  );
}
