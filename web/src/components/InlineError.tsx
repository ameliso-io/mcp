import styles from "./InlineError.module.css";

interface Props {
  error: string;
  onDismiss: () => void;
}

export default function InlineError({ error, onDismiss }: Props) {
  return (
    <div className={styles.errorCard} role="alert">
      <span>{error}</span>
      <button
        type="button"
        onClick={onDismiss}
        className={styles.errorDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
