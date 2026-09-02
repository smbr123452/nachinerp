import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Бүх оролтын нэгдсэн хэв маяг — ижил өндөр, ижил фокус. */
export const CONTROL =
  "block w-full rounded-lg border border-ink-300 bg-white text-sm text-ink-900 shadow-sm " +
  "transition-colors placeholder:text-ink-400 " +
  "hover:border-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 " +
  "disabled:cursor-not-allowed disabled:border-ink-200 disabled:bg-ink-50 disabled:text-ink-400";

export const CONTROL_HEIGHT = "h-9 px-3";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string[] | string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium leading-5 text-ink-700">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-red-500">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && messages.length === 0 ? (
        <p className="text-xs leading-5 text-ink-500">{hint}</p>
      ) : null}
      {messages.map((message) => (
        <p key={message} className="text-xs leading-5 text-red-600">
          {message}
        </p>
      ))}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, CONTROL_HEIGHT, className)} {...props} />;
}

/** Тоон оролт — баруун тийш эгнүүлж, тоог хооронд нь эгнээлнэ. */
export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      className={cn(CONTROL, CONTROL_HEIGHT, "tabular text-right", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL, CONTROL_HEIGHT, "appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      />
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-[76px] px-3 py-2", className)} {...props} />;
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5", className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 text-brand-600 transition-colors focus:ring-brand-500/30"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm leading-5 text-ink-700">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-ink-500">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

/** Формын хэсгийг гарчигтайгаар бүлэглэнэ. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? (
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
          {description ? <p className="mt-0.5 text-[13px] text-ink-500">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Формын талбаруудыг тэнцүү багануудад байрлуулна. */
export function FieldGrid({
  children,
  className,
  columns = 2,
}: {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-4",
        columns >= 2 && "sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
