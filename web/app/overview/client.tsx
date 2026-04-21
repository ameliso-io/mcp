'use client'

import { useRouter } from 'next/navigation'
import OverviewTab from '@/components/OverviewTab'
import { useRepoPath } from '@/hooks/useRepoPath'

export default function OverviewPageClient() {
  const router = useRouter()
  const [repoPath, setRepoPath] = useRepoPath()

  return (
    <OverviewTab
      repoPath={repoPath}
      onRepoPathChange={setRepoPath}
      onGoToRuns={() => router.push('/runs')}
    />
  )
}
