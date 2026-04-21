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

/* v8 ignore next 3 */
function getServerSnapshot() {
  return "";
}

function updateRepoId(id: string) {
  localStorage.setItem(REPO_ID_KEY, id);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useRepoId() {
  const repoId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [repoId, updateRepoId] as const;
}
