"use client";

import styles from "./ErrorView.module.css";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorView({ error, reset }: Props) {
  return (
    <div className={styles.centered} role="alert">
      <p className={styles.errorMessage}>{error.message || "Something went wrong."}</p>
      {error.digest && <p className={styles.digest}>Error ID: {error.digest}</p>}
      <button type="button" className={styles.btn} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
