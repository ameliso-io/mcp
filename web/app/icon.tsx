import { renderIcon } from "./ameliso-icon";

export const contentType = "image/png";

const SIZES = [32, 192, 512] as const;
type Size = (typeof SIZES)[number];

export function generateImageMetadata() {
  return SIZES.map((s) => ({
    id: String(s),
    contentType,
    size: { width: s, height: s },
  }));
}

export default function Icon({ id }: { id: string }) {
  const s = (Number(id) as Size) || 32;
  return renderIcon(s);
}
