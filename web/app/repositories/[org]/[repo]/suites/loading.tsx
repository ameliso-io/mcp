import styles from "./loading.module.css";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading suites">
      <span className="sr-only">Loading…</span>
      <Skeleton width={80} height={28} style={{ marginBottom: 20 }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.item}>
          <Skeleton width={16} height={16} borderRadius={3} />
          <Skeleton width={200} height={16} />
          <Skeleton width={40} height={20} borderRadius={999} style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}
