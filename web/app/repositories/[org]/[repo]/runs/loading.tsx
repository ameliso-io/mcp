import styles from "./loading.module.css";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading runs">
      <span className="sr-only">Loading…</span>
      <div className={styles.header}>
        <Skeleton width={80} height={28} />
        <div className={styles.headerActions}>
          <Skeleton width={120} height={32} borderRadius={6} />
          <Skeleton width={100} height={32} borderRadius={6} />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.row}>
          <Skeleton width={120} height={14} />
          <Skeleton width={70} height={20} borderRadius={4} />
          <Skeleton width={80} height={12} />
          <Skeleton width={80} height={12} />
          <div className={styles.rowEnd}>
            <Skeleton width={56} height={4} borderRadius={2} />
            <Skeleton width={40} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
