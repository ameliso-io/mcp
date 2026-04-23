import { useState, useRef, useMemo, useEffect } from "react";
import type { RunsTabProps } from "./types";
import { useRunsList } from "./useRunsList";
import { useRunSelection } from "./useRunSelection";
import { useRunResultFilter } from "./useRunResultFilter";
import { useRunPoll } from "./useRunPoll";
import { useRunCreate } from "./useRunCreate";
import { useRunRecord } from "./useRunRecord";
import { useRunActions } from "./useRunActions";
import { useRunFinalize } from "./useRunFinalize";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";

export function useRunsTab({
  repoId,
  initialSuite,
  onInitialSuiteConsumed,
  initialStatusFilter,
  onStatusFilterChange,
}: RunsTabProps) {
  const [actionAnnouncement, announce] = useAnnounce();
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const prevRunFilterCountRef = useRef<number | null>(null);
  const [recordingCase, setRecordingCase] = useState<string | null>(null);
  const [caseBody, setCaseBody] = useState<string | null>(null);
  const [resultStatusFilter, setResultStatusFilter] = useState<ResultStatus | null>(null);

  const list = useRunsList({ repoId, initialStatusFilter, onStatusFilterChange });
  const select = useRunSelection({
    repoId,
    setError: list.setError,
    setResultStatusFilter,
    setRecordingCase,
    setCaseBody,
  });
  const rf = useRunResultFilter(select.recordedResults, resultStatusFilter);
  const poll = useRunPoll({
    repoId,
    selectedRunId: select.selectedRunId,
    runs: list.runs,
    setPendingCases: select.setPendingCases,
    setTotalInScope: select.setTotalInScope,
  });
  const create = useRunCreate({
    repoId,
    initialSuite,
    onInitialSuiteConsumed,
    setRuns: list.setRuns,
    selectRun: select.selectRun,
    announce,
    setError: list.setError,
    lastFocusRef,
  });
  const record = useRunRecord({
    repoId,
    selectedRunId: select.selectedRunId,
    recordingCase,
    setRecordingCase,
    setCaseBody,
    setPendingCases: select.setPendingCases,
    setRecordedResults: select.setRecordedResults,
    setTotalInScope: select.setTotalInScope,
    announce,
    setError: list.setError,
    lastFocusRef,
  });
  const actions = useRunActions({
    repoId,
    setRuns: list.setRuns,
    setSelectedRunId: select.setSelectedRunId,
    setPendingCases: select.setPendingCases,
    setRecordedResults: select.setRecordedResults,
    setRecordingCase,
    setCaseBody,
    announce,
    setError: list.setError,
    lastFocusRef,
  });
  const finalize = useRunFinalize({
    repoId,
    setRuns: list.setRuns,
    statusFilter: list.statusFilter,
    setSelectedRunId: select.setSelectedRunId,
    setPendingCases: select.setPendingCases,
    setTotalInScope: select.setTotalInScope,
    setRecordedResults: select.setRecordedResults,
    setRecordingCase,
    setCaseBody,
    pendingCases: select.pendingCases,
    announce,
    setError: list.setError,
  });

  const filteredRuns = useMemo(
    () =>
      list.rq
        ? list.runs.filter(
            (r) =>
              r.id === select.selectedRunId ||
              r.id.toLowerCase().includes(list.rq) ||
              r.tester.toLowerCase().includes(list.rq) ||
              r.suite.toLowerCase().includes(list.rq) ||
              r.environment.toLowerCase().includes(list.rq)
          )
        : list.runs,
    [list.runs, list.rq, select.selectedRunId]
  );

  useEffect(() => {
    if (list.loading) return;
    const count = filteredRuns.length;
    if (prevRunFilterCountRef.current !== null && prevRunFilterCountRef.current !== count) {
      announceFilter(count === 1 ? "1 run found" : `${count} runs found`);
    }
    prevRunFilterCountRef.current = count;
  }, [filteredRuns.length, list.loading, announceFilter]);

  return {
    ...list,
    ...select,
    ...rf,
    ...poll,
    ...create,
    ...record,
    ...actions,
    ...finalize,
    resultStatusFilter,
    setResultStatusFilter,
    recordingCase,
    setRecordingCase,
    caseBody,
    filteredRuns,
    lastFocusRef,
    actionAnnouncement,
    filterAnnouncement,
  };
}

export type RunsTabState = ReturnType<typeof useRunsTab>;
