import type { Route } from "next";
import Link from "next/link";
import NavLink from "./NavLink";
import ServerStatus from "./ServerStatus";
import styles from "./NavBar.module.css";

interface Props {
  basePath?: string;
}

export default function NavBar({ basePath }: Props) {
  const tabItems: { href: Route; label: string }[] = basePath
    ? [
        { href: `${basePath}/overview` as Route, label: "Overview" },
        { href: `${basePath}/cases` as Route, label: "Cases" },
        { href: `${basePath}/suites` as Route, label: "Suites" },
        { href: `${basePath}/runs` as Route, label: "Runs" },
      ]
    : [];

  return (
    <header className={styles.header}>
      <Link href="/repositories" className={styles.logo}>
        Ameliso
      </Link>
      {tabItems.length > 0 && (
        <nav className={styles.nav} aria-label="Main navigation">
          <NavLink href="/repositories" label="Repositories" />
          {tabItems.map(({ href, label }) => (
            <NavLink key={href} href={href} label={label} />
          ))}
        </nav>
      )}
      <ServerStatus />
    </header>
  );
}
