import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => {
    document.removeEventListener("visibilitychange", callback);
  };
}

function getSnapshot() {
  return !document.hidden;
}

/* v8 ignore next 3 — server snapshot is SSR-only, not called in jsdom */
function getServerSnapshot() {
  return true;
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
