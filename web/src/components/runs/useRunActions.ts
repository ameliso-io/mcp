import { useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case, CaseResult, RunMeta } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setRuns: Dispatch<SetStateAction<RunMeta[]>>;
  setSelectedRunId: Dispatch<SetStateAction<string | null>>;
  setPendingCases: Dispatch<SetStateAction<Case[]>>;
  setRecordedResults: Dispatch<SetStateAction<CaseResult[]>>;
  setRecordingCase: Dispatch<SetStateAction<string | null>>;
  setCaseBody: Dispatch<SetStateAction<string | null>>;
  announce: (msg: string) => void;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
}

export function useRunActions({
  repoId,
  setRuns,
  setSelectedRunId,
  setPendingCases,
  setRecordedResults,
  setRecordingCase,
  setCaseBody,
  announce,
  setError,
  lastFocusRef,
}: Params) {
  const [confirmingDeleteRun, setConfirmingDeleteRun] = useState<string | null>(null);
  const [deletingRun, setDeletingRun] = useState(false);
  const [renamingRunId, setRenamingRunId] = useState<string | null>(null);
  const [renameNewSlug, setRenameNewSlug] = useState("");
  const [renaming, setRenaming] = useState(false);

  async function handleDeleteRun(runId: string) {
    setDeletingRun(true);
    try {
      await client.deleteRun({ repoId, runId });
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      setSelectedRunId(null);
      setPendingCases([]);
      setRecordedResults([]);
      setRecordingCase(null);
      setCaseBody(null);
      setConfirmingDeleteRun(null);
      announce("Run deleted");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeletingRun(false);
    }
  }

  async function handleRenameRun(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — form only renders when renamingRunId is set */
    if (!renamingRunId || !renameNewSlug) return;
    setRenaming(true);
    try {
      const res = await client.updateRun({ repoId, runId: renamingRunId, newSlug: renameNewSlug });
      if (res.run) {
        const renamed = res.run;
        setRuns((prev) => prev.map((r) => (r.id === renamingRunId ? renamed : r)));
      }
      setRenamingRunId(null);
      setRenameNewSlug("");
      lastFocusRef.current?.focus();
      announce("Run renamed");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRenaming(false);
    }
  }

  return {
    confirmingDeleteRun,
    setConfirmingDeleteRun,
    deletingRun,
    renamingRunId,
    setRenamingRunId,
    renameNewSlug,
    setRenameNewSlug,
    renaming,
    handleDeleteRun,
    handleRenameRun,
  };
}
