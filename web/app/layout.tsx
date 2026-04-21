import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import NavBar from '@/components/NavBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ameliso',
  description: 'Test coverage and quality management',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={styles.app}>
          <NavBar />
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
  content: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
}
