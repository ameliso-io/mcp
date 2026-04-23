import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
  useDeferredValue,
} from "react";
import type { CasesTabProps } from "./types";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case } from "@/gen/ameliso/v1/types_pb";
import { Priority } from "@/gen/ameliso/v1/types_pb";

interface Params extends Pick<
  CasesTabProps,
  | "repoId"
  | "initialSearch"
  | "initialPriorityFilter"
  | "initialTagFilter"
  | "initialSortBy"
  | "onFiltersChange"
> {
  announceFilter: (msg: string) => void;
}

export function useCasesList({
  repoId,
  initialSearch,
  initialPriorityFilter,
  initialTagFilter,
  initialSortBy,
  onFiltersChange,
  announceFilter,
}: Params) {
  const [cases, setCases] = useState<Case[]>([]);
  const deferredCases = useDeferredValue(cases);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch ?? "");
  const [priorityFilter, setPriorityFilter] = useState<Priority>(
    initialPriorityFilter ?? Priority.UNSPECIFIED
  );
  const [tagFilter, setTagFilter] = useState(initialTagFilter ?? "");
  const [suiteFilter, setSuiteFilter] = useState("");
  const [sortBy, setSortBy] = useState<"path" | "priority">(initialSortBy ?? "priority");
  const [, startSortTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadIdRef = useRef(0);
  const prevCountRef = useRef<number | null>(null);
  const onFiltersChangeRef = useRef(onFiltersChange);
  const filtersInitializedRef = useRef(false);
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }
    onFiltersChangeRef.current?.({
      search: debouncedSearch,
      priority: priorityFilter,
      tag: tagFilter,
      sort: sortBy,
    });
  }, [debouncedSearch, priorityFilter, tagFilter, sortBy]);

  const load = useCallback(async () => {
    if (!repoId) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listCases({
        repoId,
        query: debouncedSearch,
        priority: priorityFilter,
        tags: tagFilter ? [tagFilter] : [],
        suite: suiteFilter,
      });
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setCases(res.cases);
    } catch (e) {
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setError(errorMessage(e));
    } finally {
      /* v8 ignore next 1 — race guard */
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [repoId, debouncedSearch, priorityFilter, tagFilter, suiteFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const count = deferredCases.length;
    if (prevCountRef.current !== null && prevCountRef.current !== count)
      announceFilter(`${count} case${count !== 1 ? "s" : ""} found`);
    prevCountRef.current = count;
  }, [deferredCases.length, loading, announceFilter]);

  const sortedCases = useMemo(
    () =>
      [...deferredCases].sort((a, b) => {
        if (sortBy === "priority") {
          const ord: Record<string, number> = { high: 0, medium: 1, low: 2 };
          const diff = (ord[a.priority] ?? 3) - (ord[b.priority] ?? 3);
          return diff !== 0 ? diff : a.path.localeCompare(b.path);
        }
        return a.path.localeCompare(b.path);
      }),
    [deferredCases, sortBy]
  );

  const allTags = useMemo(
    () => Array.from(new Set(deferredCases.flatMap((c) => c.tags))),
    [deferredCases]
  );

  return {
    cases,
    setCases,
    deferredCases,
    loading,
    error,
    setError,
    search,
    setSearch,
    debouncedSearch,
    priorityFilter,
    setPriorityFilter,
    tagFilter,
    setTagFilter,
    suiteFilter,
    setSuiteFilter,
    sortBy,
    setSortBy,
    startSortTransition,
    load,
    sortedCases,
    allTags,
  };
}
