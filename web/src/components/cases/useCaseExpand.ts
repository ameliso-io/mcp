import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";

interface Params {
  repoId: string;
  setError: (msg: string | null) => void;
  expandingRef: MutableRefObject<string | null>;
  expandedPath: string | null;
  setExpandedPath: Dispatch<SetStateAction<string | null>>;
}

export function useCaseExpand({ repoId, setError, expandingRef, expandedPath, setExpandedPath }: Params) {
  const [expandedBody, setExpandedBody] = useState<string>("");
  const [bodyLoading, setBodyLoading] = useState(false);

  async function toggleExpand(casePath: string) {
    if (expandedPath === casePath) {
      setExpandedPath(null);
      setExpandedBody("");
      expandingRef.current = null;
      return;
    }
    setExpandedPath(casePath);
    setExpandedBody("");
    expandingRef.current = casePath;
    setBodyLoading(true);
    try {
      const res = await client.getCase({ repoId, casePath });
      if (expandingRef.current === casePath) setExpandedBody(res.body);
    } catch (e) {
      if (expandingRef.current === casePath) {
        setError(errorMessage(e));
        setExpandedPath(null);
      }
    } finally {
      if (expandingRef.current === casePath) setBodyLoading(false);
    }
  }

  return { expandedBody, bodyLoading, toggleExpand };
}
