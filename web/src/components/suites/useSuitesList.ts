import { useState, useEffect, useCallback, useRef } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Suite } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  announceFilter: (msg: string) => void;
}

export function useSuitesList({ repoId, announceFilter }: Params) {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const loadIdRef = useRef(0);
  const prevFilterCountRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!repoId) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listSuites({ repoId });
      /* v8 ignore next 1 — race guard, covered by stale load test */
      if (id !== loadIdRef.current) return;
      setSuites(res.suites);
    } catch (e) {
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setError(errorMessage(e));
    } finally {
      /* v8 ignore next 1 — race guard */
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filteredSuites = q
    ? suites.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      )
    : suites;

  useEffect(() => {
    if (loading || !q) return;
    const count = filteredSuites.length;
    if (prevFilterCountRef.current !== null && prevFilterCountRef.current !== count)
      announceFilter(count === 1 ? "1 suite found" : `${count} suites found`);
    prevFilterCountRef.current = count;
  }, [filteredSuites.length, loading, q, announceFilter]);

  return {
    suites,
    setSuites,
    loading,
    error,
    setError,
    load,
    search,
    setSearch,
    q,
    filteredSuites,
  };
}
