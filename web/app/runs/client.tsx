'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import RunsTab from '@/components/RunsTab'
import { useRepoPath } from '@/hooks/useRepoPath'

function RunsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [repoPath] = useRepoPath()
  const initialSuite = searchParams.get('suite') ?? undefined

  function handleInitialSuiteConsumed() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('suite')
    router.replace(`/runs?${params.toString()}`)
  }

  return (
    <RunsTab
      repoPath={repoPath}
      initialSuite={initialSuite}
      onInitialSuiteConsumed={handleInitialSuiteConsumed}
    />
  )
}

export default function RunsPageClient() {
  return (
    <Suspense>
      <RunsInner />
    </Suspense>
  )
}
