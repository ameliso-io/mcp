'use client'

import CasesTab from '@/components/CasesTab'
import { useRepoPath } from '@/hooks/useRepoPath'

export default function CasesPage() {
  const [repoPath] = useRepoPath()
  return <CasesTab repoPath={repoPath} />
}
