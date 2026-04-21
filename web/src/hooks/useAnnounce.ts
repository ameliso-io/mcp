import { useState, useCallback } from "react";

export function useAnnounce() {
  const [message, setMessage] = useState("");

  const announce = useCallback((text: string) => {
    setMessage("");
    setTimeout(() => setMessage(text), 50);
  }, []);

  return [message, announce] as const;
}
