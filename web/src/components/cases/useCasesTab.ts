import { useState, useRef } from "react";
import { useCasesList } from "./useCasesList";
import { useCaseCreate } from "./useCaseCreate";
import { useCaseEdit } from "./useCaseEdit";
import { useCaseExpand } from "./useCaseExpand";
import { useCaseDelete } from "./useCaseDelete";
import type { CasesTabProps } from "./types";
import { useAnnounce } from "@/hooks/useAnnounce";

export type CasesTabState = ReturnType<typeof useCasesTab>;

export function useCasesTab({
  repoId,
  initialSearch,
  initialPriorityFilter,
  initialTagFilter,
  initialSortBy,
  onFiltersChange,
}: CasesTabProps) {
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const editingBodyRef = useRef<string | null>(null);
  const expandingRef = useRef<string | null>(null);
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const [actionAnnouncement, announceAction] = useAnnounce();
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const list = useCasesList({
    repoId,
    initialSearch,
    initialPriorityFilter,
    initialTagFilter,
    initialSortBy,
    onFiltersChange,
    announceFilter,
  });

  const create = useCaseCreate({
    repoId,
    setCases: list.setCases,
    setError: list.setError,
    lastFocusRef,
    announceAction,
  });

  const edit = useCaseEdit({
    repoId,
    setCases: list.setCases,
    setError: list.setError,
    lastFocusRef,
    editingBodyRef,
    editingPath,
    setEditingPath,
    announceAction,
  });

  const expand = useCaseExpand({
    repoId,
    setError: list.setError,
    expandingRef,
    expandedPath,
    setExpandedPath,
  });

  const del = useCaseDelete({
    repoId,
    setCases: list.setCases,
    setError: list.setError,
    expandedPath,
    setExpandedPath,
    announceAction,
  });

  return {
    ...list,
    ...create,
    ...edit,
    ...expand,
    ...del,
    filterAnnouncement,
    actionAnnouncement,
    lastFocusRef,
    expandedPath,
    setExpandedPath,
    editingPath,
    setEditingPath,
  };
}
