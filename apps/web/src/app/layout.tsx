import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Брэндийн үсгийн фонт. Кирилл, латин хоёуланг агуулна.
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

// Дүрсүүд нь `public/brand/sirius-aurum-logo.png`-ээс шууд багасгасан хувилбарууд.
export const metadata: Metadata = {
  title: {
    default: "SIRIUS AURUM ERP",
    template: "%s | SIRIUS AURUM ERP",
  },
  description: "Үйлдвэрлэл, борлуулалт, нөөцийн энгийн удирдлагын систем",
  applicationName: "SIRIUS AURUM ERP",
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
