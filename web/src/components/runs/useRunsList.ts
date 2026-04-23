import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  initialStatusFilter?: RunStatus | undefined;
  onStatusFilterChange?: ((s: RunStatus) => void) | undefined;
}

export function useRunsList({ repoId, initialStatusFilter, onStatusFilterChange }: Params) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus>(
    initialStatusFilter ?? RunStatus.UNSPECIFIED
  );
  const [runSearch, setRunSearch] = useState("");
  const [filterPending, startFilterTransition] = useTransition();
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!repoId) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listRuns({ repoId, status: statusFilter });
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setRuns(res.runs);
    } catch (e) {
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setError(errorMessage(e));
    } finally {
      /* v8 ignore next 1 — race guard */
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [repoId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusFilterChange = useCallback(
    (value: RunStatus) => {
      startFilterTransition(() => {
        setStatusFilter(value);
        onStatusFilterChange?.(value);
      });
    },
    [onStatusFilterChange, startFilterTransition]
  );

  const rq = runSearch.trim().toLowerCase();

  return {
    runs,
    setRuns,
    load,
    loading,
    error,
    setError,
    statusFilter,
    runSearch,
    setRunSearch,
    filterPending,
    handleStatusFilterChange,
    rq,
  };
}
