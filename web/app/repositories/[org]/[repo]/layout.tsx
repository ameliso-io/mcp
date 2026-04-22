import type { ReactNode } from "react";
import styles from "../../../layout.module.css";
import NavBar from "@/components/NavBar";

export default async function RepoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; repo: string }>;
}) {
  const { org, repo } = await params;
  const basePath = `/repositories/${org}/${repo}`;
  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <NavBar basePath={basePath} />
      <main id="main-content" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
