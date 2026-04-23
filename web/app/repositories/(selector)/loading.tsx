import Skeleton from "@/components/Skeleton";

const card: React.CSSProperties = {
  background: "var(--color-card-bg)",
  borderRadius: 8,
  padding: 20,
  border: "1px solid var(--color-border)",
  marginBottom: 8,
};

export default function Loading() {
  return (
    <div role="status" aria-label="Loading repositories">
      <span className="sr-only">Loading…</span>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Skeleton width={150} height={28} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton width={110} height={32} borderRadius={6} />
          <Skeleton width={160} height={32} borderRadius={6} />
        </div>
      </div>
      <Skeleton width="100%" height={36} borderRadius={6} style={{ marginBottom: 20 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={card}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <Skeleton width={220} height={17} style={{ marginBottom: 8 }} />
              <Skeleton width={160} height={12} />
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
