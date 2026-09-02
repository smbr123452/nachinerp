import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Брэндийн үсгийн фонт. Кирилл, латин хоёуланг агуулна.
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "SIRIUS AURUM ERP",
    template: "%s | SIRIUS AURUM ERP",
  },
  description: "Үйлдвэрлэл, борлуулалт, нөөцийн энгийн удирдлагын систем",
  applicationName: "SIRIUS AURUM ERP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
