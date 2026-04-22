import Link from "next/link";
import { pageMetadata } from "@/lib/metadata";
import styles from "./app.module.css";

export const metadata = pageMetadata("Not Found", "The page you requested could not be found");

export default function NotFound() {
  return (
    <div className={styles.centered}>
      <h2 className={styles.heading}>404 — Page not found</h2>
      <Link href="/repositories" className={styles.link}>
        Go to Repositories
      </Link>
    </div>
  );
}
