import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "error" | "warning";

const TONES: Record<Tone, string> = {
  info: "border-brand-200 bg-brand-50 text-brand-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

const ICON_TONE: Record<Tone, string> = {
  info: "text-brand-600",
  success: "text-emerald-600",
  error: "text-red-600",
  warning: "text-amber-600",
};

const ICONS: Record<Tone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
};

/** Алдаа тод боловч түрэмгий биш — зөөлөн дэвсгэр, тодорхой текст. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
  icon = true,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", TONES[tone], className)}
    >
      {icon ? <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TONE[tone])} /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold leading-5">{title}</p> : null}
        {children ? <div className={cn("leading-5", title && "mt-1")}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Хоосон төлөв — тайлбар ба боломжтой үед дараагийн үйлдэл. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-300",
        "bg-white px-6 py-14 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400 [&>svg]:h-5 [&>svg]:w-5"
      >
        {icon ?? <Info />}
      </span>
      <div>
        <p className="text-sm font-medium text-ink-800">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-md text-body leading-5 text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
