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
        <div className="app-shell">
          <NavBar />
          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  )
}
