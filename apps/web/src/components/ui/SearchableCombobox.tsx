"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { CONTROL, CONTROL_HEIGHT } from "./Field";

/**
 * Хайлттай сонголт — олон бичлэгтэй болж болзошгүй жагсаалтад зориулав
 * (бараа, түүхий эд, нийлүүлэгч гэх мэт).
 *
 * Тогтмол цөөн сонголттой талбарт (төлөв, шалтгаан, нэгж, төлбөрийн хэлбэр)
 * энгийн `Select` хэвээр ашиглана — тэнд хайлт нэмэх нь зөвхөн саад болно.
 *
 * Хэлбэр нь `Input` / `Select`-тэй ЯГ ижил: ижил өндөр, хүрээ, радиус, фокус.
 * Загварын систем өөрчлөгдөөгүй — CONTROL токеныг шууд хуваалцаж байна.
 *
 * Формд `name` өгвөл нуугдмал талбараар утга илгээгдэнэ — одоо байгаа
 * FormData дээр суурилсан маягтууд ямар ч өөрчлөлтгүйгээр ажиллана.
 */

export type ComboboxOption = {
  value: string;
  /** Үндсэн нэр — хураангуй талбарт ганцаараа харагдана. */
  label: string;
  /** Код / SKU / утас гэх мэт хоёрдогч мэдээлэл. Зөвхөн жагсаалтад. */
  secondary?: string;
  /** Төрлийн шошго, ж: "Түүхий эд". Зөвхөн жагсаалтад. */
  badge?: string;
  /** Баруун талын нэмэлт (ж: үлдэгдэл). Зөвхөн жагсаалтад. */
  meta?: string;
  /** Бүлгийн гарчиг. Хоосон бол бүлэглэхгүй. */
  group?: string;
  /** Нэр, кодоос гадна хайгдах нэмэлт үгс. */
  keywords?: string[];
  disabled?: boolean;
};

type Props = {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  /** Формд илгээх нэр. Өгөхгүй бол зөвхөн удирдлагатай төлөв. */
  name?: string;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-labelledby"?: string;
};

/** Хайлтад ашиглах текстийг нэг мөр болгоно. */
function haystack(option: ComboboxOption): string {
  return [option.label, option.secondary, option.badge, ...(option.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  name,
  id,
  placeholder = "Хайх эсвэл сонгох...",
  searchPlaceholder = "Хайх...",
  emptyMessage = "Илэрц олдсонгүй.",
  disabled = false,
  required = false,
  className,
  ...aria
}: Props) {
  const reactId = useId();
  const controlId = id ?? `combobox-${reactId}`;
  const listboxId = `${controlId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Хэд хэдэн үгээр хайхад БҮГД таарсан байх ёстой ("гур 001").
    const terms = q.split(/\s+/);
    return options.filter((o) => {
      const hay = haystack(o);
      return terms.every((t) => hay.includes(t));
    });
  }, [options, query]);

  /** Бүлэглэсэн харагдац — бүлгийн дараалал нь эх жагсаалтын дарааллаар. */
  const groups = useMemo(() => {
    const map = new Map<string, ComboboxOption[]>();
    for (const option of filtered) {
      const key = option.group ?? "";
      const bucket = map.get(key);
      if (bucket) bucket.push(option);
      else map.set(key, [option]);
    }
    return [...map.entries()];
  }, [filtered]);

  /** Гарын товчлуурт зориулсан хавтгай жагсаалт (идэвхгүй мөрийг алгасна). */
  const navigable = useMemo(() => filtered.filter((o) => !o.disabled), [filtered]);

  // Дэлгэц дээрх байрлалыг хэмжинэ. `fixed` ашигласнаар модал болон
  // гүйлгэдэг хэсгийн дотор ч тайрагдахгүй.
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    setRect({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  // Идэвхтэй мөрийг харагдах хэсэгт байлгана.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered.length]);

  // Гадуур дарах / фокус алдах үед хаана.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = useCallback(
    (focusTrigger = true) => {
      setOpen(false);
      setQuery("");
      if (focusTrigger) triggerRef.current?.focus();
    },
    [],
  );

  const commit = useCallback(
    (option: ComboboxOption) => {
      if (option.disabled) return;
      onChange(option.value);
      close();
    },
    [onChange, close],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (navigable.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + step;
        if (next < 0) return navigable.length - 1;
        if (next >= navigable.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = navigable[activeIndex];
      if (option) commit(option);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, navigable.length - 1));
    }
  };

  const activeOption = navigable[activeIndex];
  const activeId = activeOption ? `${controlId}-opt-${activeOption.value}` : undefined;

  return (
    <div className={cn("relative", className)}>
      {/* Одоо байгаа FormData маягтууд өөрчлөлтгүй ажиллана. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        ref={triggerRef}
        type="button"
        id={controlId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={aria["aria-labelledby"]}
        onClick={() => {
          if (disabled) return;
          setActiveIndex(0);
          setOpen((v) => !v);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            setActiveIndex(0);
            setOpen(true);
          }
        }}
        className={cn(
          CONTROL,
          CONTROL_HEIGHT,
          "flex items-center gap-2 pr-9 text-left",
          open && "border-brand-500 ring-2 ring-brand-500/20",
        )}
      >
        <span
          className={cn("min-w-0 flex-1 truncate", selected ? "text-ink-900" : "text-ink-400")}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        />
      </button>

      {open && rect ? (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }),
            zIndex: 60,
          }}
          className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop"
        >
          <div className="border-b border-ink-200 p-2">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={listboxId}
                aria-required={required || undefined}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                autoComplete="off"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                className={cn(CONTROL, "h-8 pl-8 pr-3")}
              />
            </div>
          </div>

          {/* Дээд өндөр + дотоод гүйлгэлт: жагсаалт хэчнээн урт байсан ч
              хуудсыг сунгахгүй. */}
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="scrollbar-slim max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-500">{emptyMessage}</p>
            ) : (
              groups.map(([groupName, groupOptions]) => (
                <div key={groupName || "__ungrouped"}>
                  {groupName ? (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                      {groupName}
                    </p>
                  ) : null}
                  {groupOptions.map((option) => {
                    const index = navigable.indexOf(option);
                    const isActive = index >= 0 && index === activeIndex;
                    const isSelected = option.value === value;
                    return (
                      <div
                        key={option.value}
                        id={`${controlId}-opt-${option.value}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        data-index={index}
                        onMouseEnter={() => index >= 0 && setActiveIndex(index)}
                        onClick={() => commit(option)}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm",
                          isActive && "bg-brand-50",
                          option.disabled && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink-900">{option.label}</span>
                          {option.secondary ? (
                            <span className="block truncate text-[12px] text-ink-500">
                              {option.secondary}
                            </span>
                          ) : null}
                        </span>
                        {option.meta ? (
                          <span className="tabular shrink-0 whitespace-nowrap text-[12px] text-ink-500">
                            {option.meta}
                          </span>
                        ) : null}
                        {option.badge ? (
                          <span className="shrink-0 whitespace-nowrap rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                            {option.badge}
                          </span>
                        ) : null}
                        {isSelected ? (
                          <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
