import Skeleton from "@/components/Skeleton";

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
    <div role="status" aria-label="Loading cases">
      <span className="sr-only">Loading…</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Skeleton width={100} height={28} />
        <Skeleton width={100} height={32} borderRadius={6} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 }}>
        <Skeleton width={220} height={32} borderRadius={6} />
        <Skeleton width={110} height={32} borderRadius={6} />
        <Skeleton width={110} height={32} borderRadius={6} />
        <Skeleton width={110} height={32} borderRadius={6} />
        <Skeleton width={90} height={32} borderRadius={6} />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={row}>
          <Skeleton width={8} height={8} borderRadius="50%" />
          <Skeleton width={200} height={14} />
          <Skeleton width={150} height={13} />
          <Skeleton width={60} height={11} style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}
