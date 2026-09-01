import type { Config } from "tailwindcss";

/**
 * Дизайн систем: цагаан + мэргэжлийн цэнхэр.
 * Өнгө бүр утга илэрхийлнэ — чимэглэлийн зорилгоор шинэ өнгө нэмэхгүй.
 */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Үндсэн цэнхэр — үйлдэл, идэвхтэй төлөв, онцлох утга
        brand: {
          50: "#eff5ff",
          100: "#dbe8fe",
          200: "#bfd7fe",
          300: "#93bbfd",
          400: "#6096fa",
          500: "#3b74f6",
          600: "#2456eb",
          700: "#1c43d8",
          800: "#1d39af",
          900: "#1d348a",
        },
        // Саарал — текст, хүрээ, дэвсгэр
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e6ebf2",
          300: "#cfd8e3",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f1c33",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Noto Sans",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        // Тоон үзүүлэлтэд зориулсан хэмжээнүүд
        kpi: ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }],
        "kpi-sm": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em" }],
      },
      borderRadius: {
        card: "0.625rem",
      },
      boxShadow: {
        // Хуудасны дэвсгэрээс бага зэрэг сэрвийлгэх зөөлөн сүүдэр
        card: "0 1px 2px 0 rgb(15 28 51 / 0.04), 0 1px 3px 0 rgb(15 28 51 / 0.03)",
        "card-hover": "0 2px 4px -1px rgb(15 28 51 / 0.06), 0 4px 10px -2px rgb(15 28 51 / 0.05)",
        pop: "0 8px 24px -6px rgb(15 28 51 / 0.14), 0 2px 6px -2px rgb(15 28 51 / 0.08)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
