import Link from "next/link";
import styles from "../../../app.module.css";

export default function RepoNotFound() {
  return (
    <div className={styles.centered}>
      <h2 className={styles.heading}>404 — Repository not found</h2>
      <Link href="/repositories" className={styles.link}>
        Back to Repositories
      </Link>
    </div>
  );
}
