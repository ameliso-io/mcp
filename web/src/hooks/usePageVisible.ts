import { useState, useEffect } from "react";

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(!document.hidden);
    function handleChange() {
      setVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", handleChange);
    return () => {
      document.removeEventListener("visibilitychange", handleChange);
    };
  }, []);

  return visible;
}
