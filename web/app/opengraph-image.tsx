import { ImageResponse } from "next/og";

export const alt = "Ameliso — Test Coverage & Quality Management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: "#1e293b",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            background: "#334155",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
            fontWeight: 700,
          }}
        >
          A
        </div>
        <div style={{ fontSize: 64, fontWeight: 700 }}>Ameliso</div>
      </div>
      <div style={{ fontSize: 28, color: "#94a3b8" }}>
        Test Coverage &amp; Quality Management
      </div>
    </div>,
    { ...size }
  );
}
