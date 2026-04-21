"use client";

import styles from "./app.module.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.centered}>
      <p className={styles.errorMessage}>{error.message || "Something went wrong."}</p>
      <button className={styles.btn} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
