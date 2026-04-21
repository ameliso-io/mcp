import type { Metadata } from 'next'
import RunsPageClient from './client'

export const metadata: Metadata = {
  title: 'Runs',
}

export default function RunsPage() {
  return <RunsPageClient />
}
