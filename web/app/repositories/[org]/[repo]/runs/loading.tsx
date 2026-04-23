import Skeleton from "@/components/Skeleton";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 12,
  background: "var(--color-card-bg)",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  marginBottom: 8,
};

export default function Loading() {
  return (
    <div role="status" aria-label="Loading runs">
      <span className="sr-only">Loading…</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Skeleton width={80} height={28} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton width={120} height={32} borderRadius={6} />
          <Skeleton width={100} height={32} borderRadius={6} />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={row}>
          <Skeleton width={120} height={14} />
          <Skeleton width={70} height={20} borderRadius={4} />
          <Skeleton width={80} height={12} />
          <Skeleton width={80} height={12} />
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4 }}>
            <Skeleton width={56} height={4} borderRadius={2} />
            <Skeleton width={40} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
