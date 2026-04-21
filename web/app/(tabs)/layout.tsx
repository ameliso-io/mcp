import type { ReactNode } from 'react'
import { Suspense } from 'react'
import styles from '../app.module.css'

function TabFallback() {
  return (
    <div className={styles.centered}>
      <div className={styles.spinner} />
    </div>
  )
}

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<TabFallback />}>{children}</Suspense>
}
