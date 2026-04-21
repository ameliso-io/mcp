'use client'

import { useRouter } from 'next/navigation'
import RepositoriesTab from '@/components/RepositoriesTab'
import { useRepoPath } from '@/hooks/useRepoPath'

export default function RepositoriesPage() {
  const router = useRouter()
  const [repoPath, setRepoPath] = useRepoPath()

  function handleRepoSelect(path: string) {
    setRepoPath(path)
    router.push('/overview')
  }

  return <RepositoriesTab activeRepoPath={repoPath} onRepoSelect={handleRepoSelect} />
}
