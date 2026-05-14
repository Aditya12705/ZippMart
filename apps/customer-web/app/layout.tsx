import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZippMart",
  description: "Groceries at the speed of beep."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="shopRoot">
      <body className="shopRoot__body">{children}</body>
    </html>
  );
}
