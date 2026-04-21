import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import NavBar from "@/components/NavBar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Ameliso",
  description: "Test coverage and quality management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="app-shell">
          <NavBar />
          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
