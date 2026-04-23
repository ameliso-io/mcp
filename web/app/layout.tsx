import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { inter } from "@/lib/fonts";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e293b" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  interactiveWidget: "resizes-visual",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Ameliso",
    template: "%s | Ameliso",
  },
  description: "Test coverage and quality management",
  openGraph: {
    title: {
      default: "Ameliso",
      template: "%s | Ameliso",
    },
    description: "Test coverage and quality management",
    type: "website",
    siteName: "Ameliso",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Ameliso",
      template: "%s | Ameliso",
    },
    description: "Test coverage and quality management",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
