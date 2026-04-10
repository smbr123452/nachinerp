import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nachin ERP",
  description: "Internal ERP system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}

