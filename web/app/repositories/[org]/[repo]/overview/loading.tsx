import Skeleton from "@/components/Skeleton";

const card: React.CSSProperties = {
  background: "var(--color-card-bg)",
  borderRadius: 8,
  padding: 20,
  border: "1px solid var(--color-border)",
  marginBottom: 16,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  background: "var(--color-surface)",
  borderRadius: 6,
  marginBottom: 8,
};

export default function Loading() {
  return (
    <div role="status" aria-label="Loading overview">
      <span className="sr-only">Loading…</span>
      <Skeleton width={130} height={28} style={{ marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={card}>
            <Skeleton width={80} height={12} style={{ marginBottom: 8 }} />
            <Skeleton width={48} height={36} />
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Skeleton width={160} height={14} />
          <Skeleton width={100} height={28} borderRadius={6} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={row}>
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
