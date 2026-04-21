import type { ReactNode } from "react";
import NavBar from "@/components/NavBar";
import styles from "../layout.module.css";

export default function TabsLayout({ children }: { children: ReactNode }) {
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
