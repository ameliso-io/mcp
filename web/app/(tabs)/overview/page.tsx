import type { Metadata } from 'next'
import OverviewPageClient from './client'

export const metadata: Metadata = {
  title: 'Overview',
}

export default function OverviewPage() {
  return <OverviewPageClient />
}
