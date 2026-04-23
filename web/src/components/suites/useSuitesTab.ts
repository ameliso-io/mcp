import { useRef, useEffect } from "react";
import { useSuitesList } from "./useSuitesList";
import { useSuiteCreate } from "./useSuiteCreate";
import { useSuiteEdit } from "./useSuiteEdit";
import { useSuiteExpand } from "./useSuiteExpand";
import { useSuiteDelete } from "./useSuiteDelete";
import type { SuitesTabProps } from "./types";
import { useAnnounce } from "@/hooks/useAnnounce";

export type SuitesTabState = ReturnType<typeof useSuitesTab>;

export function useSuitesTab({ repoId, basePath, initialExpanded, onExpandedChange }: SuitesTabProps) {
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const expandingRef = useRef<string | null>(null);
  const initialExpandedRef = useRef<string | null>(initialExpanded ?? null);
  const onExpandedChangeRef = useRef(onExpandedChange);
  const toggleExpandRef = useRef<(slug: string) => void>((_slug: string) => undefined);
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const [actionAnnouncement, announce] = useAnnounce();

  const list = useSuitesList({ repoId, announceFilter });
  const expand = useSuiteExpand({ repoId, expandingRef, onExpandedChangeRef });
  const create = useSuiteCreate({ repoId, load: list.load, setError: list.setError, lastFocusRef, announce });
  const edit = useSuiteEdit({ repoId, load: list.load, setError: list.setError, lastFocusRef, announce });
  const del = useSuiteDelete({ repoId, setSuites: list.setSuites, setError: list.setError, expanded: expand.expanded, setExpanded: expand.setExpanded, announce, load: list.load });

  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
    toggleExpandRef.current = (slug: string) => void expand.toggleExpand(slug);
  });

  useEffect(() => {
    const slug = initialExpandedRef.current;
    if (!slug || list.suites.length === 0) return;
    if (!list.suites.some((s) => s.slug === slug)) return;
    initialExpandedRef.current = null;
    toggleExpandRef.current(slug);
  }, [list.suites]);

  return { ...list, ...create, ...edit, ...expand, ...del, filterAnnouncement, actionAnnouncement, lastFocusRef, basePath };
}
