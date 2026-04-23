import styles from "./loading.module.css";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading repositories">
      <span className="sr-only">Loading…</span>
      <div className={styles.header}>
        <Skeleton width={150} height={28} />
        <div className={styles.headerActions}>
          <Skeleton width={110} height={32} borderRadius={6} />
          <Skeleton width={160} height={32} borderRadius={6} />
        </div>
      </div>
      <Skeleton width="100%" height={36} borderRadius={6} style={{ marginBottom: 20 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.card}>
          <div className={styles.cardRow}>
            <div>
              <Skeleton width={220} height={17} style={{ marginBottom: 8 }} />
              <Skeleton width={160} height={12} />
            </div>
            <div className={styles.cardActions}>
              <Skeleton width={44} height={30} borderRadius={6} />
              <Skeleton width={44} height={30} borderRadius={6} />
              <Skeleton width={68} height={30} borderRadius={6} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
