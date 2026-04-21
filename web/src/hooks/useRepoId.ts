import { useState, useEffect } from "react";

const REPO_ID_KEY = "ameliso:repoId";

export function useRepoId() {
  const [repoId, setRepoId] = useState("");

  useEffect(() => {
    setRepoId(localStorage.getItem(REPO_ID_KEY) ?? "");
  }, []);

  function updateRepoId(id: string) {
    setRepoId(id);
    localStorage.setItem(REPO_ID_KEY, id);
  }

  return [repoId, updateRepoId] as const;
}
