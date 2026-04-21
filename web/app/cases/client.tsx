'use client'

import CasesTab from '@/components/CasesTab'
import { useRepoPath } from '@/hooks/useRepoPath'

export default function CasesPageClient() {
  const [repoPath] = useRepoPath()
  return <CasesTab repoPath={repoPath} />
}
