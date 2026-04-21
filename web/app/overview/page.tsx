import type { Metadata } from 'next'
import OverviewPageClient from './client'

export const metadata: Metadata = {
  title: 'Overview | Ameliso',
}

export default function OverviewPage() {
  return <OverviewPageClient />
}
