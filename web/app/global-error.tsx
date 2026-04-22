"use client";

import { Inter } from "next/font/google";
import "./globals.css";
import styles from "./app.module.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <div className={`${styles.centered} ${styles.fullPage}`} role="alert">
          <h2 className={styles.heading}>Something went wrong</h2>
          <p className={styles.message}>{error.message || "An unexpected error occurred."}</p>
          {error.digest && <p className={styles.digest}>Error ID: {error.digest}</p>}
          <button type="button" className={styles.btn} onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
