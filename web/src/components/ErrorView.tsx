"use client";

import styles from "../../app/app.module.css";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorView({ error, reset }: Props) {
  return (
    <div className={styles.centered}>
      <p className={styles.errorMessage}>{error.message || "Something went wrong."}</p>
      <button className={styles.btn} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
