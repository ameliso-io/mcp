import { useEffect, useRef } from "react";

export function useInterval(callback: () => void, delayMs: number | null) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => {
      callbackRef.current();
    }, delayMs);
    return () => {
      clearInterval(id);
    };
  }, [delayMs]);
}
