import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#bcdcff",
          500: "#2f6fed",
          600: "#1f56c9",
          700: "#1a45a0",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
