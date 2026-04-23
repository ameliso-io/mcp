import { useState, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  initialSuite?: string | undefined;
  onInitialSuiteConsumed?: (() => void) | undefined;
  setRuns: Dispatch<SetStateAction<RunMeta[]>>;
  selectRun: (runId: string, status: RunStatus) => Promise<void>;
  announce: (msg: string) => void;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
}

export function useRunCreate({
  repoId, initialSuite, onInitialSuiteConsumed, setRuns, selectRun, announce, setError, lastFocusRef,
}: Params) {
  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTester, setNewTester] = useState("");
  const [newEnv, setNewEnv] = useState("");
  const [newSuite, setNewSuite] = useState("");
  const [newCases, setNewCases] = useState("");
  const [newCommitSha, setNewCommitSha] = useState("");
  const [creating, setCreating] = useState(false);
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!initialSuite || consumedRef.current) return;
    consumedRef.current = true;
    setNewSuite(initialSuite);
    setShowCreate(true);
    onInitialSuiteConsumed?.();
  }, [initialSuite, onInitialSuiteConsumed]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — required fields prevent submission when blank */
    if (!repoId || !newSlug) return;
    setCreating(true);
    try {
      const created = await client.createRun({
        repoId, slug: newSlug, tester: newTester, environment: newEnv, suite: newSuite,
        cases: newCases ? newCases.split(",").map((c) => c.trim()).filter(Boolean) : [],
        commitSha: newCommitSha,
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setNewSlug(""); setNewTester(""); setNewEnv(""); setNewSuite(""); setNewCases(""); setNewCommitSha("");
      announce("Run created");
      const newRun = created.run;
      if (newRun) {
        setRuns((prev) => [...prev, newRun]);
        await selectRun(newRun.id, newRun.status);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return {
    showCreate, setShowCreate,
    newSlug, setNewSlug, newTester, setNewTester, newEnv, setNewEnv,
    newSuite, setNewSuite, newCases, setNewCases, newCommitSha, setNewCommitSha,
    creating, handleCreate,
  };
}
