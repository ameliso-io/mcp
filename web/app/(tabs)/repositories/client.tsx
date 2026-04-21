'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import RepositoriesTab from '@/components/RepositoriesTab'
import { useRepoPath } from '@/hooks/useRepoPath'

export default function RepositoriesPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [repoPath, setRepoPath] = useRepoPath()

  const installationId = searchParams.get('installation_id') ?? undefined

  function handleRepoSelect(path: string) {
    setRepoPath(path)
    router.push('/overview')
  }

  return (
    <RepositoriesTab
      activeRepoPath={repoPath}
      onRepoSelect={handleRepoSelect}
      installationId={installationId}
      onCallbackHandled={() => router.replace('/repositories')}
    />
  )
}
