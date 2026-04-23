import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

interface Props {
  nav: ReactNode;
  children: ReactNode;
}

export default function AppShell({ nav, children }: Props) {
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {nav}
      <main id="main-content" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
