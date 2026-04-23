import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

interface Props {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
}

export default function Skeleton({ width, height, borderRadius, className, style }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.block}${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}
