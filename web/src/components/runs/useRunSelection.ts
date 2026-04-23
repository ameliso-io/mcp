import { useState, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case, CaseResult } from "@/gen/ameliso/v1/types_pb";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setError: Dispatch<SetStateAction<string | null>>;
  setResultStatusFilter: Dispatch<SetStateAction<import("@/gen/ameliso/v1/types_pb").ResultStatus | null>>;
  setRecordingCase: Dispatch<SetStateAction<string | null>>;
  setCaseBody: Dispatch<SetStateAction<string | null>>;
}

export function useRunSelection({
  repoId,
  setError,
  setResultStatusFilter,
  setRecordingCase,
  setCaseBody,
}: Params) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingCases, setPendingCases] = useState<Case[]>([]);
  const [totalInScope, setTotalInScope] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);
  const [recordedResults, setRecordedResults] = useState<CaseResult[]>([]);
  const [caseTitleMap, setCaseTitleMap] = useState<Map<string, Case>>(new Map());
  const selectingRef = useRef<string | null>(null);

  const selectRun = useCallback(
    async (runId: string, status: RunStatus) => {
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        setPendingCases([]);
        setRecordedResults([]);
        setResultStatusFilter(null);
        setRecordingCase(null);
        setCaseBody(null);
        selectingRef.current = null;
        return;
      }
      setSelectedRunId(runId);
      selectingRef.current = runId;
      setLoadingPending(true);
      setPendingCases([]);
      setRecordedResults([]);
      setResultStatusFilter(null);
      setRecordingCase(null);
      setCaseBody(null);
      try {
        if (status === RunStatus.IN_PROGRESS) {
          const [pendingRes, runRes, casesRes] = await Promise.all([
            client.getPendingCases({ repoId, runId }),
            client.getRun({ repoId, runId }),
            client.listCases({ repoId }),
          ]);
          /* v8 ignore next 1 — race guard */
          if (selectingRef.current !== runId) return;
          setPendingCases(pendingRes.cases);
          setTotalInScope(pendingRes.totalInScope);
          setRecordedResults(runRes.run?.results ?? /* v8 ignore next */ []);
          setCaseTitleMap(new Map(casesRes.cases.map((c) => [c.path, c])));
        } else {
          const [runRes, casesRes] = await Promise.all([
            client.getRun({ repoId, runId }),
            client.listCases({ repoId }),
          ]);
          /* v8 ignore next 1 — race guard */
          if (selectingRef.current !== runId) return;
          setRecordedResults(runRes.run?.results ?? /* v8 ignore next */ []);
          setCaseTitleMap(new Map(casesRes.cases.map((c) => [c.path, c])));
        }
      } catch (e) {
        /* v8 ignore next 1 — race guard */
        if (selectingRef.current !== runId) return;
        setError(errorMessage(e));
      } finally {
        /* v8 ignore next 1 — race guard */
        if (selectingRef.current === runId) setLoadingPending(false);
      }
    },
    [selectedRunId, repoId, setError, setResultStatusFilter, setRecordingCase, setCaseBody]
  );

  return {
    selectedRunId,
    setSelectedRunId,
    selectRun,
    pendingCases,
    setPendingCases,
    totalInScope,
    setTotalInScope,
    loadingPending,
    recordedResults,
    setRecordedResults,
    caseTitleMap,
  };
}
