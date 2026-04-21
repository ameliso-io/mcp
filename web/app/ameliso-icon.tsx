import { ImageResponse } from "next/og";

export function renderIcon(size: number): ImageResponse {
  const radius = Math.round(size * 0.19);
  const fontSize = Math.round(size * 0.56);
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        background: "#1e293b",
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      A
    </div>,
    { width: size, height: size }
  );
}
