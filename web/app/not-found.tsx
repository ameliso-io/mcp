import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>404 — Page not found</h2>
      <Link href="/overview" style={styles.link}>
        Go to Overview
      </Link>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
    padding: '48px',
    color: '#64748b',
  },
  heading: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
  },
}
