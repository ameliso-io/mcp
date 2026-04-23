import styles from "./loading.module.css";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading overview">
      <span className="sr-only">Loading…</span>
      <Skeleton width={130} height={28} style={{ marginBottom: 20 }} />
      <div className={styles.statsGrid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.card}>
            <Skeleton width={80} height={12} style={{ marginBottom: 8 }} />
            <Skeleton width={48} height={36} />
          </div>
        ))}
      </div>
      <div className={styles.card}>
        <div className={styles.coverageHeader}>
          <Skeleton width={160} height={14} />
          <Skeleton width={100} height={28} borderRadius={6} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.row}>
            <Skeleton width={10} height={10} borderRadius="50%" />
            <Skeleton width={200} height={14} />
            <Skeleton width={120} height={13} />
            <Skeleton width={60} height={11} style={{ marginLeft: "auto" }} />
            <Skeleton width={50} height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
