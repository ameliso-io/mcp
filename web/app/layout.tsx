import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  // Enables size-adjust on fallbacks to minimize CLS during font swap
  fallback: ["system-ui", "sans-serif"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#1e293b",
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
    card: "summary",
    title: {
      default: "Ameliso",
      template: "%s | Ameliso",
    },
    description: "Test coverage and quality management",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
