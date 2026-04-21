import { useSyncExternalStore } from "react";

const REPO_ID_KEY = "ameliso:repoId";
const CHANGE_EVENT = "ameliso:repoId:change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot() {
  return localStorage.getItem(REPO_ID_KEY) ?? "";
}

function getServerSnapshot() {
  return "";
}

export function useRepoId() {
  const repoId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function updateRepoId(id: string) {
    localStorage.setItem(REPO_ID_KEY, id);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return [repoId, updateRepoId] as const;
}
