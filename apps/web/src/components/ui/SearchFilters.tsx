"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Input, Select } from "./Field";

/** URL query-д суурилсан энгийн шүүлтүүр. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-3">{children}</div>
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
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  return { params, update, pending };
}

export function SearchInput({ paramKey = "q", placeholder = "Хайх..." }: { paramKey?: string; placeholder?: string }) {
  const { params, update } = useQueryUpdater();
  return (
    <div className="w-full sm:w-64">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Хайлт</label>
      <Input
        type="search"
        defaultValue={params.get(paramKey) ?? ""}
        placeholder={placeholder}
        onChange={(event) => update(paramKey, event.target.value)}
      />
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
    <div className="w-full sm:w-48">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <Select value={params.get(paramKey) ?? ""} onChange={(event) => update(paramKey, event.target.value)}>
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
    <div className="w-full sm:w-44">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <Input
        type="date"
        defaultValue={params.get(paramKey) ?? ""}
        onChange={(event) => update(paramKey, event.target.value)}
      />
    </div>
  );
}
