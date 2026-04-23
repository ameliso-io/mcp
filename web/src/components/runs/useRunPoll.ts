import { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { client } from "@/client";
import type { Case } from "@/gen/ameliso/v1/types_pb";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  selectedRunId: string | null;
  runs: RunMeta[];
  setPendingCases: Dispatch<SetStateAction<Case[]>>;
  setTotalInScope: Dispatch<SetStateAction<number>>;
}

export function useRunPoll({
  repoId,
  selectedRunId,
  runs,
  setPendingCases,
  setTotalInScope,
}: Params) {
  const [pollFailCount, setPollFailCount] = useState(0);
  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPollFailCount(0);
    if (pendingPollRef.current) clearInterval(pendingPollRef.current);
    const selectedRun = runs.find((r) => r.id === selectedRunId);
    if (selectedRun?.status === RunStatus.IN_PROGRESS && selectedRunId) {
      const runId = selectedRunId;
      pendingPollRef.current = setInterval(() => {
        void client
          .getPendingCases({ repoId, runId })
          .then((res) => {
            setPendingCases(res.cases);
            setTotalInScope(res.totalInScope);
            setPollFailCount(0);
          })
          .catch(() => {
            setPollFailCount((n) => n + 1);
          });
      }, 30_000);
    }
    return () => {
      if (pendingPollRef.current) clearInterval(pendingPollRef.current);
    };
  }, [repoId, selectedRunId, runs, setPendingCases, setTotalInScope]);

  return { pollFailCount };
}
