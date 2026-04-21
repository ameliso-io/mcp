'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './NavBar.module.css'

const NAV_ITEMS = [
  { href: '/repositories', label: 'Repositories' },
  { href: '/overview', label: 'Overview' },
  { href: '/cases', label: 'Cases' },
  { href: '/suites', label: 'Suites' },
  { href: '/runs', label: 'Runs' },
] as const

export default function NavBar() {
  const pathname = usePathname()

  return (
    <header className={styles.header}>
      <span className={styles.logo}>Ameliso</span>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || (pathname === '/' && href === '/overview')
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.link}${active ? ` ${styles.linkActive}` : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
