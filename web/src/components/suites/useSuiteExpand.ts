import { useState } from "react";
import type { MutableRefObject } from "react";
import { client } from "@/client";
import type { Case } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  expandingRef: MutableRefObject<string | null>;
  onExpandedChangeRef: MutableRefObject<((slug: string | null) => void) | undefined>;
}

export function useSuiteExpand({ repoId, expandingRef, onExpandedChangeRef }: Params) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedCases, setExpandedCases] = useState<Case[]>([]);
  const [expandedCasesLoading, setExpandedCasesLoading] = useState(false);

  async function toggleExpand(slug: string) {
    if (expanded === slug) {
      setExpanded(null);
      setExpandedCases([]);
      expandingRef.current = null;
      onExpandedChangeRef.current?.(null);
      return;
    }
    setExpanded(slug);
    setExpandedCases([]);
    expandingRef.current = slug;
    onExpandedChangeRef.current?.(slug);
    setExpandedCasesLoading(true);
    try {
      const res = await client.listCases({ repoId, suite: slug });
      if (expandingRef.current === slug) setExpandedCases(res.cases);
    } catch {
      // silently fall back — suite.cases paths still visible
    } finally {
      if (expandingRef.current === slug) setExpandedCasesLoading(false);
    }
  }

  return { expanded, setExpanded, expandedCases, expandedCasesLoading, toggleExpand };
}
