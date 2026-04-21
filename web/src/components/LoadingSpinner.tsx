import styles from "../../app/app.module.css";

export default function LoadingSpinner() {
  return (
    <div className={styles.centered} role="status" aria-label="Loading">
      <div className={styles.spinner} />
    </div>
  );
}
