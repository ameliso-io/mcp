import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import NavBar from "@/components/NavBar";
import "./globals.css";
import styles from "./layout.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: {
    default: "Ameliso",
    template: "%s | Ameliso",
  },
  description: "Test coverage and quality management",
  openGraph: {
    title: "Ameliso",
    description: "Test coverage and quality management",
    type: "website",
    siteName: "Ameliso",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className={styles.shell}>
          <NavBar />
          <main id="main-content" className={styles.content}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
