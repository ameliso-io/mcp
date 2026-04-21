"use client";

import styles from "./app.module.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className={`${styles.centered} ${styles.fullPage}`}>
          <h2 className={styles.heading}>Something went wrong</h2>
          <p className={styles.message}>{error.message}</p>
          <button className={styles.btn} onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
