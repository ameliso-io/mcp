import { useState, useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case, CaseResult } from "@/gen/ameliso/v1/types_pb";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";

export interface RunRecordParams {
  repoId: string;
  selectedRunId: string | null;
  recordingCase: string | null;
  setRecordingCase: Dispatch<SetStateAction<string | null>>;
  setCaseBody: Dispatch<SetStateAction<string | null>>;
  setPendingCases: Dispatch<SetStateAction<Case[]>>;
  setRecordedResults: Dispatch<SetStateAction<CaseResult[]>>;
  setTotalInScope: Dispatch<SetStateAction<number>>;
  announce: (msg: string) => void;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
}

export function useRunRecord({
  repoId,
  selectedRunId,
  recordingCase,
  setRecordingCase,
  setCaseBody,
  setPendingCases,
  setRecordedResults,
  setTotalInScope,
  announce,
  setError,
  lastFocusRef,
}: RunRecordParams) {
  const [recordStatus, setRecordStatus] = useState<ResultStatus>(ResultStatus.PASSED);
  const [recordNotes, setRecordNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [caseBodyLoading, setCaseBodyLoading] = useState(false);
  const recordingBodyRef = useRef<string | null>(null);

  const handleRecord = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      /* v8 ignore next 2 — record form only shown when both are set */
      if (!selectedRunId || !recordingCase) return;
      setRecording(true);
      try {
        await client.recordResult({
          repoId,
          runId: selectedRunId,
          casePath: recordingCase,
          status: recordStatus,
          notes: recordNotes,
        });
        setRecordingCase(null);
        lastFocusRef.current?.focus();
        setRecordNotes("");
        setRecordStatus(ResultStatus.PASSED);
        setCaseBody(null);
        announce("Result recorded");
        const [pendingRes, runRes] = await Promise.all([
          client.getPendingCases({ repoId, runId: selectedRunId }),
          client.getRun({ repoId, runId: selectedRunId }),
        ]);
        setPendingCases(pendingRes.cases);
        setTotalInScope(pendingRes.totalInScope);
        setRecordedResults(runRes.run?.results ?? []);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setRecording(false);
      }
    },
    [
      selectedRunId,
      recordingCase,
      repoId,
      recordStatus,
      recordNotes,
      announce,
      setRecordingCase,
      setCaseBody,
      setPendingCases,
      setTotalInScope,
      setRecordedResults,
      setError,
      lastFocusRef,
    ]
  );

  async function openRecord(casePath: string) {
    if (recordingCase === casePath) {
      setRecordingCase(null);
      setCaseBody(null);
      recordingBodyRef.current = null;
      return;
    }
    lastFocusRef.current = document.activeElement as HTMLElement;
    setRecordingCase(casePath);
    setRecordNotes("");
    setRecordStatus(ResultStatus.PASSED);
    setCaseBody(null);
    recordingBodyRef.current = casePath;
    setCaseBodyLoading(true);
    try {
      const res = await client.getCase({ repoId, casePath });
      /* v8 ignore next 1 — race guard */
      if (recordingBodyRef.current === casePath) setCaseBody(res.body || null);
    } catch {
      // body unavailable; proceed without it
    } finally {
      /* v8 ignore next 1 — race guard */
      if (recordingBodyRef.current === casePath) setCaseBodyLoading(false);
    }
  }

  return {
    recordStatus,
    setRecordStatus,
    recordNotes,
    setRecordNotes,
    recording,
    caseBodyLoading,
    handleRecord,
    openRecord,
  };
}
