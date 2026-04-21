"use client";

import type { Route } from "next";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import styles from "./NavBar.module.css";

interface Props {
  href: Route<string>;
  label: string;
}

function NavLinkLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span data-pending={pending || undefined} className={styles.navLinkLabel}>
      {label}
    </span>
  );
}

export default function NavLink({ href, label }: Props) {
  const pathname = usePathname();
  const active = pathname === href || (href === "/overview" && pathname === "/");
  return (
    <Link
      href={href}
      className={`${styles.link}${active ? ` ${styles.linkActive}` : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <NavLinkLabel label={label} />
    </Link>
  );
}
