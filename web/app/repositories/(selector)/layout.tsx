import type { ReactNode } from "react";
import Link from "next/link";
import styles from "../../layout.module.css";
import navStyles from "@/components/NavBar.module.css";

export default function RepositoriesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className={navStyles.header}>
        <Link href="/repositories" className={navStyles.logo}>
          Ameliso
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
