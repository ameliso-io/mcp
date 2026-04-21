import Link from 'next/link'
import styles from './app.module.css'

export default function NotFound() {
  return (
    <div className={styles.centered}>
      <h2 className={styles.heading}>404 — Page not found</h2>
      <Link href="/overview" className={styles.link}>
        Go to Overview
      </Link>
    </div>
  )
}
