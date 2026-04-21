import Link from "next/link";
import NavLink from "./NavLink";
import styles from "./NavBar.module.css";

const NAV_ITEMS = [
  { href: "/repositories", label: "Repositories" },
  { href: "/overview", label: "Overview" },
  { href: "/cases", label: "Cases" },
  { href: "/suites", label: "Suites" },
  { href: "/runs", label: "Runs" },
] as const;

export default function NavBar() {
  return (
    <header className={styles.header}>
      <Link href="/overview" className={styles.logo}>
        Ameliso
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label }) => (
          <NavLink key={href} href={href} label={label} />
        ))}
      </nav>
    </header>
  );
}
