import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: "#1e293b",
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
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
