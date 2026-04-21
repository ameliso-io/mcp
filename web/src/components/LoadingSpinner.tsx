import styles from "../../app/app.module.css";

export default function LoadingSpinner() {
  return (
    <div className={styles.centered}>
      <div className={styles.spinner} />
    </div>
  );
}
