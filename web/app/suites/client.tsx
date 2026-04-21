'use client'

import { useRouter } from 'next/navigation'
import SuitesTab from '@/components/SuitesTab'
import { useRepoPath } from '@/hooks/useRepoPath'

export default function SuitesPageClient() {
  const router = useRouter()
  const [repoPath] = useRepoPath()

  return (
    <SuitesTab
      repoPath={repoPath}
      onRunSuite={(slug) => router.push(`/runs?suite=${encodeURIComponent(slug)}`)}
    />
  )
}
