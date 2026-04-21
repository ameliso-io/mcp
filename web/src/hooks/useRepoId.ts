import { useState } from "react";

const REPO_ID_KEY = "ameliso:repoId";

export function useRepoId() {
  const [repoId, setRepoId] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(REPO_ID_KEY) ?? "" : "")
  );

  function updateRepoId(id: string) {
    setRepoId(id);
    localStorage.setItem(REPO_ID_KEY, id);
  }

  return [repoId, updateRepoId] as const;
}
