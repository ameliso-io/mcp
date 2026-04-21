'use client'

import { useState } from 'react'

const REPO_PATH_KEY = 'ameliso:repoPath'

export function useRepoPath() {
  const [repoPath, setRepoPath] = useState(() =>
    typeof window === 'undefined' ? '' : (localStorage.getItem(REPO_PATH_KEY) ?? '')
  )

  function updateRepoPath(p: string) {
    setRepoPath(p)
    localStorage.setItem(REPO_PATH_KEY, p)
  }

  return [repoPath, updateRepoPath] as const
}
