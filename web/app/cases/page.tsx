import type { Metadata } from 'next'
import CasesPageClient from './client'

export const metadata: Metadata = {
  title: 'Cases | Ameliso',
}

export default function CasesPage() {
  return <CasesPageClient />
}
