import { cn } from "@/lib/cn";

/** Ачаалж буйг харуулах нам гүм орлуулагч. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-ink-100", className)} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-card border border-ink-200 bg-white shadow-card">
      <div className="flex gap-4 border-b border-ink-200 bg-ink-50 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-ink-100 px-4 py-3.5">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Хуудас ачаалж байх үеийн ерөнхий орлуулагч.
 *
 * Хуудсын жинхэнэ бүтэц (гарчиг → шүүлтүүр → хүснэгт) -ийг давтсан тул
 * агуулга ирэхэд байрлал үсрэхгүй. Route-ийн `loading.tsx`-д ашиглагдана:
 * сервер хуудсыг бэлдэж байх хугацаанд хэрэглэгч хоосон дэлгэц хармааргүй.
 */
export function PageSkeleton({
  filters = true,
  rows = 8,
  columns = 5,
}: {
  filters?: boolean;
  rows?: number;
  columns?: number;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Ачаалж байна…</span>

      {/* Хуудасны гарчиг ба үйлдлүүд */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {filters ? (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-card">
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-full sm:w-44" />
          <Skeleton className="h-9 w-full sm:w-44" />
        </div>
      ) : null}

      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}
