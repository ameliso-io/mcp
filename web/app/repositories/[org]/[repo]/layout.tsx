import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "../../../layout.module.css";
import NavBar from "@/components/NavBar";

type Params = Promise<{ org: string; repo: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org, repo } = await params;
  const repoTitle = `${org}/${repo}`;
  const template = `%s — ${repoTitle} | Ameliso`;
  return {
    title: { template, absolute: `${repoTitle} | Ameliso` },
    openGraph: { title: { template, absolute: `${repoTitle} | Ameliso` } },
    twitter: { title: { template, absolute: `${repoTitle} | Ameliso` } },
  };
}

export default async function RepoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
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
