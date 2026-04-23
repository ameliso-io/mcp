import { useRef, useEffect, useCallback } from "react";

export function useAbortController() {
  const ref = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      ref.current?.abort();
    },
    []
  );

  return useCallback((): AbortSignal => {
    ref.current?.abort();
    const ctrl = new AbortController();
    ref.current = ctrl;
    return ctrl.signal;
  }, []);
}
