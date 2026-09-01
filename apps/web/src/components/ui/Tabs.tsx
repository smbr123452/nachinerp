import Link from "next/link";
import { cn } from "@/lib/cn";

export type TabItem = { key: string; label: string; href: string };

/** Хуудас доторх таб — URL query дээр суурилсан тул сервер талд рендэрлэнэ. */
export function Tabs({
  items,
  active,
  className,
}: {
  items: TabItem[];
  active: string;
  className?: string;
}) {
  return (
    <div className={cn("no-print mb-4 border-b border-ink-200", className)}>
      <nav className="scrollbar-slim -mb-px flex gap-1 overflow-x-auto" aria-label="Хэсгүүд">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
