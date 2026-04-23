import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case, CaseResult, RunMeta } from "@/gen/ameliso/v1/types_pb";
import { RunStatus, ResultStatus } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setRuns: Dispatch<SetStateAction<RunMeta[]>>;
  statusFilter: RunStatus;
  setSelectedRunId: Dispatch<SetStateAction<string | null>>;
  setPendingCases: Dispatch<SetStateAction<Case[]>>;
  setTotalInScope: Dispatch<SetStateAction<number>>;
  setRecordedResults: Dispatch<SetStateAction<CaseResult[]>>;
  setRecordingCase: Dispatch<SetStateAction<string | null>>;
  setCaseBody: Dispatch<SetStateAction<string | null>>;
  pendingCases: Case[];
  announce: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function useRunFinalize({
  repoId, setRuns, statusFilter, setSelectedRunId, setPendingCases, setTotalInScope,
  setRecordedResults, setRecordingCase, setCaseBody, pendingCases, announce, setError,
}: Params) {
  const [confirmingFinalize, setConfirmingFinalize] = useState<{ runId: string; status: RunStatus } | null>(null);
  const [confirmingBulkPass, setConfirmingBulkPass] = useState<string | null>(null);
  const [bulkPassing, setBulkPassing] = useState(false);

  async function handleFinalize(runId: string, status: RunStatus) {
    setConfirmingFinalize(null);
    try {
      const res = await client.finalizeRun({ repoId, runId, status });
      const finalized = res.run;
      setRuns((prev) => {
        /* v8 ignore next 1 — only when server returns no run object */
        if (!finalized) return prev.filter((r) => r.id !== runId);
        if (statusFilter !== RunStatus.UNSPECIFIED && finalized.status !== statusFilter) {
          return prev.filter((r) => r.id !== runId);
        }
        /* v8 ignore next 1 — ternary false branch covered by filter returning array */
        return prev.map((r) => (r.id === runId ? finalized : r));
      });
      setSelectedRunId(null);
      setPendingCases([]);
      announce(status === RunStatus.COMPLETED ? "Run completed" : "Run aborted");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleBulkPass(runId: string) {
    /* v8 ignore next 2 — button only renders when pendingCases.length > 0 */
    if (pendingCases.length === 0) return;
    setConfirmingBulkPass(null);
    setBulkPassing(true);
    try {
      const resp = await client.bulkRecordResults({
        repoId, runId,
        results: pendingCases.map((c) => ({ casePath: c.path, status: ResultStatus.PASSED, notes: "" })),
      });
      setPendingCases([]);
      setTotalInScope(resp.totalInScope);
      setRecordingCase(null);
      setCaseBody(null);
      const runRes = await client.getRun({ repoId, runId });
      setRecordedResults(runRes.run?.results ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBulkPassing(false);
    }
  }

  return { confirmingFinalize, setConfirmingFinalize, confirmingBulkPass, setConfirmingBulkPass, bulkPassing, handleFinalize, handleBulkPass };
}
