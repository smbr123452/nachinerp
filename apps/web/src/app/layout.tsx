import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Начин ERP",
  description: "Үйлдвэрлэл, борлуулалт, нөөцийн энгийн удирдлагын систем",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
