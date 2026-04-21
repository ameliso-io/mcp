import { useState, useEffect } from 'react'

const REPO_PATH_KEY = 'ameliso:repoPath'

export function useRepoPath() {
  const [repoPath, setRepoPath] = useState('')

  useEffect(() => {
    setRepoPath(localStorage.getItem(REPO_PATH_KEY) ?? '')
  }, [])

  function updateRepoPath(p: string) {
    setRepoPath(p)
    localStorage.setItem(REPO_PATH_KEY, p)
  }

  return [repoPath, updateRepoPath] as const
}
