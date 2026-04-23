import styles from "./loading.module.css";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading cases">
      <span className="sr-only">Loading…</span>
      <div className={styles.header}>
        <Skeleton width={100} height={28} />
        <Skeleton width={100} height={32} borderRadius={6} />
      </div>
      <div className={styles.filterBar}>
        <Skeleton width={220} height={32} borderRadius={6} />
        <Skeleton width={110} height={32} borderRadius={6} />
        <Skeleton width={110} height={32} borderRadius={6} />
        <Skeleton width={110} height={32} borderRadius={6} />
        <Skeleton width={90} height={32} borderRadius={6} />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.row}>
          <Skeleton width={8} height={8} borderRadius="50%" />
          <Skeleton width={200} height={14} />
          <Skeleton width={150} height={13} />
          <Skeleton width={60} height={11} style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}
