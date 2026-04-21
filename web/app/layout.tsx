'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import './globals.css'

const NAV_ITEMS = [
  { href: '/repositories', label: 'Repositories' },
  { href: '/overview', label: 'Overview' },
  { href: '/cases', label: 'Cases' },
  { href: '/suites', label: 'Suites' },
  { href: '/runs', label: 'Runs' },
] as const

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <html lang="en">
      <body>
        <div style={styles.app}>
          <header style={styles.header}>
            <span style={styles.logo}>Ameliso</span>
            <nav style={styles.nav}>
              {NAV_ITEMS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  style={styles.navLink(pathname === href || (pathname === '/' && href === '/overview'))}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          <main style={styles.content}>{children}</main>
        </div>
      </body>
    </html>
  )
}

const styles = {
  app: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    color: '#1a1a1a',
  },
  header: {
    backgroundColor: '#1e293b',
    color: 'white',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    borderBottom: '1px solid #334155',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    padding: '16px 0',
    color: '#e2e8f0',
  },
  nav: {
    display: 'flex',
    gap: '4px',
  },
  navLink: (active: boolean): React.CSSProperties => ({
    background: active ? '#334155' : 'transparent',
    color: active ? 'white' : '#94a3b8',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    textDecoration: 'none',
    display: 'inline-block',
  }),
  content: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
}
