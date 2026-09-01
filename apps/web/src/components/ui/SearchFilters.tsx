"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input, Select } from "./Field";
import { cn } from "@/lib/cn";

/** URL query-д суурилсан шүүлтүүрийн эгнээ. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "no-print mb-4 flex flex-wrap items-end gap-3 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-card",
        className,
      )}
    >
      <SlidersHorizontal aria-hidden className="mb-2.5 h-4 w-4 shrink-0 text-ink-400" />
      {children}
    </div>
  );
}

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  };

  return { params, update, pending };
}

const LABEL = "mb-1.5 block text-[13px] font-medium leading-5 text-ink-700";

export function SearchInput({
  paramKey = "q",
  placeholder = "Хайх...",
  label = "Хайлт",
}: {
  paramKey?: string;
  placeholder?: string;
  label?: string;
}) {
  const { params, update } = useQueryUpdater();
  const initial = params.get(paramKey) ?? "";
  const [value, setValue] = useState(initial);

  // Гадна талаас (жишээ нь буцах товч) query өөрчлөгдвөл дагана.
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  // Бичиж дуусахад л хайна — үсэг бүрээр сервер рүү явахгүй.
  useEffect(() => {
    if (value === initial) return;
    const timer = setTimeout(() => update(paramKey, value), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="w-full sm:w-64">
      <label className={LABEL} htmlFor={`filter-${paramKey}`}>
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        />
        <Input
          id={`filter-${paramKey}`}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}

export function FilterSelect({
  paramKey,
  label,
  options,
  allLabel = "Бүгд",
}: {
  paramKey: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const { params, update } = useQueryUpdater();
  return (
    <div className="w-full sm:w-44">
      <label className={LABEL} htmlFor={`filter-${paramKey}`}>
        {label}
      </label>
      <Select
        id={`filter-${paramKey}`}
        value={params.get(paramKey) ?? ""}
        onChange={(event) => update(paramKey, event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function DateFilter({ paramKey, label }: { paramKey: string; label: string }) {
  const { params, update } = useQueryUpdater();
  return (
    <div className="w-full sm:w-40">
      <label className={LABEL} htmlFor={`filter-${paramKey}`}>
        {label}
      </label>
      <Input
        id={`filter-${paramKey}`}
        type="date"
        value={params.get(paramKey) ?? ""}
        onChange={(event) => update(paramKey, event.target.value)}
      />
    </div>
  );
}
