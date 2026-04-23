import type { Route } from "next";
import Link from "next/link";
import styles from "./NotFoundView.module.css";

interface Props {
  heading: string;
  backHref: Route;
  backLabel: string;
}

export default function NotFoundView({ heading, backHref, backLabel }: Props) {
  return (
    <div className={styles.centered}>
      <h2 className={styles.heading}>{heading}</h2>
      <Link href={backHref} className={styles.link}>
        {backLabel}
      </Link>
    </div>
  );
}
