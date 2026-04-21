import type { Metadata } from 'next'
import SuitesPageClient from './client'

export const metadata: Metadata = {
  title: 'Suites | Ameliso',
}

export default function SuitesPage() {
  return <SuitesPageClient />
}
