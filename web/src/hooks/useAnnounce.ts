import { useState, useCallback, useRef, useEffect } from "react";

export function useAnnounce() {
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const announce = useCallback((text: string) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setMessage("");
    timerRef.current = setTimeout(() => {
      setMessage(text);
      timerRef.current = null;
    }, 50);
  }, []);

  return [message, announce] as const;
}
