import type { ReactNode } from "react";
import styles from "../../layout.module.css";
import NavBar from "@/components/NavBar";

export default function RepositoriesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <NavBar />
      <main id="main-content" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
