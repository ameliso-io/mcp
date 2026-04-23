"use client";

import type { Route } from "next";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
  useDeferredValue,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./RunsTab.module.css";
import LoadingSpinner from "./LoadingSpinner";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import { useAnnounce } from "@/hooks/useAnnounce";
import { useInterval } from "@/hooks/useInterval";
import { usePageVisible } from "@/hooks/usePageVisible";
import { useAbortController } from "@/hooks/useAbortController";
import type { RunMeta, Case, CaseResult } from "@/gen/ameliso/v1/types_pb";
import { RunStatus, ResultStatus } from "@/gen/ameliso/v1/types_pb";

const MarkdownBody = dynamic(() => import("./MarkdownBody"), {
  ssr: false,
  /* v8 ignore next 1 — loading shown during initial chunk fetch, not reachable in unit tests */
  loading: () => <LoadingSpinner />,
});

interface Props {
  repoId: string;
  basePath: string;
  initialSuite?: string | undefined;
  onInitialSuiteConsumed?: (() => void) | undefined;
  initialStatusFilter?: RunStatus | undefined;
  onStatusFilterChange?: ((s: RunStatus) => void) | undefined;
  initialSelectedRunId?: string | undefined;
  onSelectedRunIdChange?: ((id: string | null) => void) | undefined;
  initialResultStatusFilter?: ResultStatus | null | undefined;
  onResultStatusFilterChange?: ((s: ResultStatus | null) => void) | undefined;
}

function statusLabel(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED:
      return "Passed";
    case ResultStatus.FAILED:
      return "Failed";
    case ResultStatus.BLOCKED:
      return "Blocked";
    case ResultStatus.SKIPPED:
      return "Skipped";
    default:
      return "Unknown";
  }
}

function runStatusLabel(s: RunStatus): string {
  switch (s) {
    case RunStatus.IN_PROGRESS:
      return "In Progress";
    case RunStatus.COMPLETED:
      return "Completed";
    case RunStatus.ABORTED:
      return "Aborted";
    default:
      return "Unknown";
  }
}

export default function RunsTab({
  repoId,
  basePath,
  initialSuite,
  onInitialSuiteConsumed,
  initialStatusFilter,
  onStatusFilterChange,
  initialSelectedRunId,
  onSelectedRunIdChange,
  initialResultStatusFilter,
  onResultStatusFilterChange,
}: Props) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus>(
    initialStatusFilter ?? RunStatus.UNSPECIFIED
  );

  // Create run form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    slug: "",
    tester: "",
    env: "",
    suite: "",
    cases: "",
  });
  const [newCommitSha, setNewCommitSha] = useState("");
  const [creating, setCreating] = useState(false);

  // Selected run for recording results or viewing results
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectedRunIdRef = useRef(selectedRunId);
  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);
  const onSelectedRunIdChangeRef = useRef(onSelectedRunIdChange);
  useEffect(() => {
    onSelectedRunIdChangeRef.current = onSelectedRunIdChange;
  });
  const [pendingCases, setPendingCases] = useState<Case[]>([]);
  const [totalInScope, setTotalInScope] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);
  const [recordedResults, setRecordedResults] = useState<CaseResult[]>([]);
  const [resultStatusFilter, setResultStatusFilter] = useState<ResultStatus | null>(null);
  const [caseTitleMap, setCaseTitleMap] = useState<Map<string, Case>>(new Map());

  // Record result form
  const [recordState, setRecordState] = useState<{
    casePath: string;
    status: ResultStatus;
    notes: string;
    body: string | null;
    bodyLoading: boolean;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [bulkPassing, setBulkPassing] = useState(false);

  const [confirmingDeleteRun, setConfirmingDeleteRun] = useState<string | null>(null);
  const [deletingRun, setDeletingRun] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState<{
    runId: string;
    status: RunStatus;
  } | null>(null);
  const [confirmingBulkPass, setConfirmingBulkPass] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ runId: string; slug: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [runSearch, setRunSearch] = useState("");
  const [actionAnnouncement, announce] = useAnnounce();
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const prevRunFilterCountRef = useRef<number | null>(null);
  const [filterPending, startFilterTransition] = useTransition();
  const selectingRef = useRef<string | null>(null);

  const selectRun = useCallback(
    async (runId: string, status: RunStatus) => {
      if (selectedRunIdRef.current === runId) {
        setSelectedRunId(null);
        onSelectedRunIdChangeRef.current?.(null);
        setPendingCases([]);
        setRecordedResults([]);
        setResultStatusFilter(null);
        setRecordState(null);
        selectingRef.current = null;
        return;
      }
      setSelectedRunId(runId);
      onSelectedRunIdChangeRef.current?.(runId);
      selectingRef.current = runId;
      setLoadingPending(true);
      setPendingCases([]);
      setRecordedResults([]);
      setResultStatusFilter(null);
      setRecordState(null);
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
    [repoId]
  );

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const consumedRef = useRef(false);
  useEffect(() => {
    if (!initialSuite || consumedRef.current) return;
    consumedRef.current = true;
    setCreateForm((f) => ({ ...f, suite: initialSuite }));
    setShowCreate(true);
    onInitialSuiteConsumed?.();
  }, [initialSuite, onInitialSuiteConsumed]);

  const [pollFailCount, setPollFailCount] = useState(0);

  const consumedSelectedRef = useRef(false);
  useEffect(() => {
    if (!initialSelectedRunId || consumedSelectedRef.current || runs.length === 0) return;
    consumedSelectedRef.current = true;
    const run = runs.find((r) => r.id === initialSelectedRunId);
    if (run) void selectRun(run.id, run.status);
  }, [runs, initialSelectedRunId, selectRun]);

  const consumedResultFilterRef = useRef(false);
  useEffect(() => {
    if (
      initialResultStatusFilter == null ||
      consumedResultFilterRef.current ||
      recordedResults.length === 0
    )
      return;
    consumedResultFilterRef.current = true;
    setResultStatusFilter(initialResultStatusFilter);
  }, [recordedResults, initialResultStatusFilter]);

  // Auto-refresh pending cases every 30s when viewing an in-progress run — paused when tab is hidden
  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const isSelectedInProgress = selectedRun?.status === RunStatus.IN_PROGRESS && !!selectedRunId;
  const pageVisible = usePageVisible();
  useInterval(
    async () => {
      /* v8 ignore next 2 — guard for stale interval after deselect */
      if (!selectedRunId) return;
      try {
        const res = await client.getPendingCases({ repoId, runId: selectedRunId });
        setPendingCases(res.cases);
        setTotalInScope(res.totalInScope);
        setPollFailCount(0);
      } catch {
        setPollFailCount((n) => n + 1);
      }
    },
    isSelectedInProgress && pageVisible ? 30_000 : null
  );

  const nextAbort = useAbortController();

  const load = useCallback(async () => {
    const signal = nextAbort();
    setLoading(true);
    setError(null);
    try {
      const res = await client.listRuns({ repoId, status: statusFilter }, { signal });
      /* v8 ignore next 2 — abort guard */
      if (signal.aborted) return;
      setRuns(res.runs);
    } catch (e) {
      /* v8 ignore next 2 — abort guard */
      if (signal.aborted) return;
      setError(errorMessage(e));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [repoId, statusFilter, nextAbort]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — required fields prevent submission when blank */
    if (!repoId || !createForm.slug) return;
    setCreating(true);
    try {
      const created = await client.createRun({
        repoId,
        slug: createForm.slug,
        tester: createForm.tester,
        environment: createForm.env,
        suite: createForm.suite,
        cases: createForm.cases
          ? createForm.cases
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : [],
        commitSha: newCommitSha,
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setCreateForm({ slug: "", tester: "", env: "", suite: "", cases: "" });
      setNewCommitSha("");
      announce("Run created");
      await load();
      if (created.run) {
        await selectRun(created.run.id, created.run.status);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — record form only shown when both are set */
    if (!selectedRunId || !recordState) return;
    setRecording(true);
    try {
      const res = await client.recordResult({
        repoId,
        runId: selectedRunId,
        casePath: recordState.casePath,
        status: recordState.status,
        notes: recordState.notes,
      });
      setRecordState(null);
      lastFocusRef.current?.focus();
      announce("Result recorded");
      setPendingCases(res.pending.flatMap((e) => (e.case ? [e.case] : [])));
      setTotalInScope(res.totalInScope);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRecording(false);
    }
  }

  async function openRecord(casePath: string) {
    if (recordState?.casePath === casePath) {
      setRecordState(null);
      return;
    }
    lastFocusRef.current = document.activeElement as HTMLElement;
    setRecordState({
      casePath,
      notes: "",
      status: ResultStatus.PASSED,
      body: null,
      bodyLoading: true,
    });
    try {
      const res = await client.getCase({ repoId, casePath });
      setRecordState((s) => s && { ...s, body: res.body || null });
    } catch {
      // body unavailable; proceed without it
    } finally {
      setRecordState((s) => s && { ...s, bodyLoading: false });
    }
  }

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
      onSelectedRunIdChange?.(null);
      setPendingCases([]);
      announce(status === RunStatus.COMPLETED ? "Run completed" : "Run aborted");
      void load();
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
        repoId,
        runId,
        results: pendingCases.map((c) => ({
          casePath: c.path,
          status: ResultStatus.PASSED,
          notes: "",
        })),
      });
      setPendingCases([]);
      setTotalInScope(resp.totalInScope);
      setRecordState(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBulkPassing(false);
    }
  }

  async function handleDeleteRun(runId: string) {
    setDeletingRun(true);
    try {
      await client.deleteRun({ repoId, runId });
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        onSelectedRunIdChange?.(null);
        setPendingCases([]);
        setRecordState(null);
      }
      setConfirmingDeleteRun(null);
      announce("Run deleted");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeletingRun(false);
    }
  }

  async function handleRenameRun(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — form only renders when renameState is set */
    if (!renameState?.slug) return;
    setRenaming(true);
    try {
      await client.updateRun({ repoId, runId: renameState.runId, newSlug: renameState.slug });
      setRenameState(null);
      lastFocusRef.current?.focus();
      announce("Run renamed");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRenaming(false);
    }
  }

  const resultCounts = useMemo(
    () => ({
      passed: recordedResults.filter((r) => r.status === ResultStatus.PASSED).length,
      failed: recordedResults.filter((r) => r.status === ResultStatus.FAILED).length,
      blocked: recordedResults.filter((r) => r.status === ResultStatus.BLOCKED).length,
      skipped: recordedResults.filter((r) => r.status === ResultStatus.SKIPPED).length,
    }),
    [recordedResults]
  );

  const deferredResultStatusFilter = useDeferredValue(resultStatusFilter);
  const filteredResults = useMemo(
    () =>
      deferredResultStatusFilter !== null
        ? recordedResults.filter((r) => r.status === deferredResultStatusFilter)
        : recordedResults,
    [recordedResults, deferredResultStatusFilter]
  );
  const deferredFilteredResults = useDeferredValue(filteredResults);
  const isResultsStale = filteredResults !== deferredFilteredResults;

  const rq = runSearch.trim().toLowerCase();
  const filteredRuns = rq
    ? runs.filter(
        (r) =>
          r.id === selectedRunId ||
          r.id.toLowerCase().includes(rq) ||
          r.tester.toLowerCase().includes(rq) ||
          r.suite.toLowerCase().includes(rq) ||
          r.environment.toLowerCase().includes(rq)
      )
    : runs;

  useEffect(() => {
    if (loading || !rq) return;
    const count = filteredRuns.length;
    if (prevRunFilterCountRef.current !== null && prevRunFilterCountRef.current !== count) {
      announceFilter(count === 1 ? "1 run found" : `${count} runs found`);
    }
    prevRunFilterCountRef.current = count;
  }, [filteredRuns.length, loading, rq, announceFilter]);

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {actionAnnouncement}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {filterAnnouncement}
      </div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Runs</h2>
          <div role="group" aria-label="Filter by status" aria-busy={filterPending}>
            {(
              [
                { label: "All", value: RunStatus.UNSPECIFIED },
                { label: "In Progress", value: RunStatus.IN_PROGRESS },
                { label: "Completed", value: RunStatus.COMPLETED },
                { label: "Aborted", value: RunStatus.ABORTED },
              ] satisfies { label: string; value: RunStatus }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  startFilterTransition(() => {
                    setStatusFilter(opt.value);
                    onStatusFilterChange?.(opt.value);
                  });
                }}
                aria-pressed={statusFilter === opt.value}
                className={
                  statusFilter === opt.value ? styles.filterBtnActive : styles.filterBtnInactive
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!showCreate) lastFocusRef.current = document.activeElement as HTMLElement;
            setShowCreate(!showCreate);
          }}
          className={styles.btn}
        >
          {showCreate ? "Cancel" : "+ New Run"}
        </button>
      </div>

      {showCreate && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Create Run</h3>
          <form
            aria-label="Create Run"
            onSubmit={handleCreate}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              setShowCreate(false);
              lastFocusRef.current?.focus();
            }}
            className={styles.formGrid}
          >
            <div>
              <label className={`${styles.label} ${styles.requiredLabel}`}>
                Slug
                <input
                  value={createForm.slug}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  required
                  pattern="[a-z0-9_-]+"
                  title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)"
                  maxLength={100}
                  autoFocus
                  className={styles.input}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Tester
                <input
                  value={createForm.tester}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, tester: e.target.value }));
                  }}
                  maxLength={255}
                  className={styles.input}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Environment
                <input
                  value={createForm.env}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, env: e.target.value }));
                  }}
                  maxLength={255}
                  className={styles.input}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Suite (optional)
                <input
                  value={createForm.suite}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, suite: e.target.value }));
                  }}
                  maxLength={100}
                  className={styles.input}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>
                Inline cases (optional, comma-separated paths)
                <input
                  value={createForm.cases}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, cases: e.target.value }));
                  }}
                  className={styles.input}
                  placeholder="auth/login, billing/checkout"
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Commit SHA (optional)
                <input
                  value={newCommitSha}
                  onChange={(e) => {
                    setNewCommitSha(e.target.value);
                  }}
                  maxLength={40}
                  className={styles.input}
                  placeholder="HEAD commit SHA"
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <button type="submit" disabled={creating} className={styles.btnGreen}>
                {creating ? "Creating…" : "Create Run"}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className={styles.errorCard} role="alert">
          <span>{error}</span>
          <div className={styles.errorActions}>
            <button
              type="button"
              onClick={() => {
                void load();
              }}
              className={styles.errorRetry}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
              }}
              className={styles.errorDismiss}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className={styles.searchWrapper}>
          <input
            type="search"
            aria-label="Search runs"
            placeholder="Search runs…"
            value={runSearch}
            onChange={(e) => {
              setRunSearch(e.target.value);
            }}
            className={styles.searchInput}
          />
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
        </div>
      )}

      {loading && runs.length === 0 && (
        <div className={styles.loadingMsg} role="status">
          Loading…
        </div>
      )}

      {!loading && runs.length === 0 && !error && (
        <div className={styles.emptyCard}>No runs found.</div>
      )}

      {!loading && rq && filteredRuns.length === 0 && runs.length > 0 && (
        <div className={styles.emptyCard}>No runs match &ldquo;{runSearch}&rdquo;.</div>
      )}

      <ul className={styles.list} aria-busy={loading} role="list">
        {filteredRuns.map((run) => (
          <li key={run.id}>
            <div className={selectedRunId === run.id ? styles.runCardSelected : styles.runCard}>
              <div className={styles.runRow}>
                <button
                  type="button"
                  className={styles.runExpandBtn}
                  onClick={() => selectRun(run.id, run.status)}
                  aria-label={`${runStatusLabel(run.status)} run ${run.id}`}
                  aria-expanded={selectedRunId === run.id}
                >
                  <span className={styles.runStatusBadge} data-status={RunStatus[run.status]}>
                    {runStatusLabel(run.status)}
                  </span>
                  <span className={styles.runId}>{run.id}</span>
                  {run.suite && <span className={styles.suiteBadge}>{run.suite}</span>}
                  {run.tester && <span className={styles.runTester}>{run.tester}</span>}
                  {run.environment && <span className={styles.runEnv}>{run.environment}</span>}
                  {run.commitSha && (
                    <code className={styles.runCommitSha} title={run.commitSha}>
                      {run.commitSha.slice(0, 7)}
                    </code>
                  )}
                  <time className={styles.runDate} dateTime={run.date}>
                    {run.date}
                  </time>
                </button>
                {renameState?.runId !== run.id && (
                  <button
                    type="button"
                    onClick={() => {
                      lastFocusRef.current = document.activeElement as HTMLElement;
                      setRenameState({ runId: run.id, slug: "" });
                    }}
                    aria-label={`Rename ${run.id}`}
                    className={styles.btnOutlineSm}
                  >
                    Rename
                  </button>
                )}
                {confirmingDeleteRun === run.id ? (
                  <>
                    <span className={styles.confirmText}>Delete?</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteRun(run.id)}
                      aria-label={`Confirm delete ${run.id}`}
                      disabled={deletingRun}
                      className={styles.btnDangerSm}
                    >
                      {deletingRun ? "Deleting…" : "Yes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDeleteRun(null);
                      }}
                      aria-label="Cancel delete"
                      className={styles.btnOutlineSm}
                      autoFocus
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDeleteRun(run.id);
                    }}
                    aria-label={`Delete ${run.id}`}
                    className={styles.btnDangerSm}
                  >
                    Delete
                  </button>
                )}
              </div>
              {renameState?.runId === run.id && (
                <form
                  aria-label={`Rename run ${run.id}`}
                  onSubmit={handleRenameRun}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.preventDefault();
                    setRenameState(null);
                    lastFocusRef.current?.focus();
                  }}
                  className={styles.renameForm}
                >
                  <span className={styles.renamePrefix}>{run.id.slice(0, 10)}-</span>
                  <input
                    value={renameState.slug}
                    onChange={(e) => {
                      setRenameState((s) => s && { ...s, slug: e.target.value });
                    }}
                    required
                    pattern="[a-z0-9_-]+"
                    title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)"
                    maxLength={100}
                    autoFocus
                    className={styles.renameInput}
                    placeholder="new-slug"
                    aria-label="New slug"
                  />
                  <button type="submit" disabled={renaming} className={styles.btnSaveSm}>
                    {renaming ? "Renaming…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameState(null);
                      lastFocusRef.current?.focus();
                    }}
                    className={styles.btnCancelSm}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>

            {selectedRunId === run.id && (
              <div className={styles.expandedPanel} aria-busy={loadingPending}>
                {loadingPending ? (
                  <div className={styles.panelLoading} role="status">
                    Loading…
                  </div>
                ) : run.status !== RunStatus.IN_PROGRESS ? (
                  <div>
                    {recordedResults.length > 0 && (
                      <div
                        className={styles.resultFilters}
                        role="group"
                        aria-label="Filter by result status"
                      >
                        {[
                          {
                            label: "Passed",
                            count: resultCounts.passed,
                            status: ResultStatus.PASSED,
                          },
                          {
                            label: "Failed",
                            count: resultCounts.failed,
                            status: ResultStatus.FAILED,
                          },
                          {
                            label: "Blocked",
                            count: resultCounts.blocked,
                            status: ResultStatus.BLOCKED,
                          },
                          {
                            label: "Skipped",
                            count: resultCounts.skipped,
                            status: ResultStatus.SKIPPED,
                          },
                        ]
                          .filter((s) => s.count > 0)
                          .map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => {
                                const next = resultStatusFilter === s.status ? null : s.status;
                                setResultStatusFilter(next);
                                onResultStatusFilterChange?.(next);
                              }}
                              aria-pressed={resultStatusFilter === s.status}
                              className={`${styles.resultFilterBtn}${resultStatusFilter === s.status ? ` ${styles.resultFilterBtnActive}` : ""}`}
                              data-status={ResultStatus[s.status]}
                            >
                              {s.count} {s.label}
                            </button>
                          ))}
                        {resultStatusFilter !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              setResultStatusFilter(null);
                              onResultStatusFilterChange?.(null);
                            }}
                            className={styles.showAllBtn}
                          >
                            Show all
                          </button>
                        )}
                      </div>
                    )}
                    {recordedResults.length === 0 ? (
                      <p className={styles.noResults}>No results recorded.</p>
                    ) : (
                      <ul
                        className={
                          isResultsStale
                            ? `${styles.resultList} ${styles.resultListStale}`
                            : styles.resultList
                        }
                        role="list"
                        aria-busy={isResultsStale}
                      >
                        {deferredFilteredResults.map((r) => {
                          const caseEntry = caseTitleMap.get(r.casePath);
                          return (
                            <li key={r.casePath} className={styles.resultRow}>
                              <span
                                className={styles.resultStatusBadge}
                                data-status={ResultStatus[r.status]}
                              >
                                {statusLabel(r.status)}
                              </span>
                              <Link
                                href={
                                  `${basePath}/cases?case=${encodeURIComponent(r.casePath)}` as Route
                                }
                                className={styles.resultPath}
                              >
                                {r.casePath}
                              </Link>
                              {caseEntry?.title && (
                                <span className={styles.resultTitle}>{caseEntry.title}</span>
                              )}
                              {r.notes && <span className={styles.resultNotes}>{r.notes}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : (
                  <>
                    {totalInScope > 0 && (
                      <div className={styles.progressWrap}>
                        <div className={styles.progressMeta}>
                          <span>
                            {totalInScope - pendingCases.length} / {totalInScope} done
                          </span>
                          <span>
                            {Math.round(
                              ((totalInScope - pendingCases.length) / totalInScope) * 100
                            )}
                            %
                          </span>
                        </div>
                        <div
                          className={styles.progressTrack}
                          role="progressbar"
                          aria-label="Run completion progress"
                          aria-valuemin={0}
                          aria-valuemax={totalInScope}
                          aria-valuenow={totalInScope - pendingCases.length}
                          aria-valuetext={`${totalInScope - pendingCases.length} of ${totalInScope} case${totalInScope !== 1 ? "s" : ""} complete`}
                        >
                          <div
                            className={styles.progressBar}
                            style={{
                              width: `${((totalInScope - pendingCases.length) / totalInScope) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className={styles.pendingHeader}>
                      <h3 className={styles.pendingLabel}>
                        {pendingCases.length} pending
                        {pollFailCount >= 2 ? (
                          <span className={styles.staleWarning} role="status" aria-live="polite">
                            data may be stale
                          </span>
                        ) : (
                          <span className={styles.refreshHint}>auto-refresh 30s</span>
                        )}
                      </h3>
                      <div className={styles.pendingActions}>
                        {pendingCases.length > 0 &&
                          (confirmingBulkPass === run.id ? (
                            <>
                              <span className={styles.confirmText}>Pass all?</span>
                              <button
                                type="button"
                                aria-label={`Confirm pass all ${pendingCases.length} pending case${pendingCases.length !== 1 ? "s" : ""}`}
                                onClick={() => handleBulkPass(run.id)}
                                disabled={bulkPassing}
                                className={styles.btnBlueSm}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel bulk pass"
                                onClick={() => {
                                  setConfirmingBulkPass(null);
                                }}
                                className={styles.btnOutlineSm}
                                autoFocus
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingBulkPass(run.id);
                              }}
                              disabled={bulkPassing}
                              className={styles.btnBlueSm}
                            >
                              {bulkPassing ? "Marking…" : `All Passed (${pendingCases.length})`}
                            </button>
                          ))}
                        {confirmingFinalize?.runId === run.id ? (
                          <>
                            <span className={styles.confirmText}>
                              {confirmingFinalize.status === RunStatus.COMPLETED
                                ? "Complete?"
                                : "Abort?"}
                            </span>
                            <button
                              type="button"
                              aria-label={`Confirm ${confirmingFinalize.status === RunStatus.COMPLETED ? "complete" : "abort"} run ${run.id}`}
                              onClick={() => handleFinalize(run.id, confirmingFinalize.status)}
                              className={
                                confirmingFinalize.status === RunStatus.COMPLETED
                                  ? styles.btnGreenSm
                                  : styles.btnRedSm
                              }
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel"
                              onClick={() => {
                                setConfirmingFinalize(null);
                              }}
                              className={styles.btnOutlineSm}
                              autoFocus
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label={`Complete run ${run.id}`}
                              onClick={() => {
                                setConfirmingFinalize({
                                  runId: run.id,
                                  status: RunStatus.COMPLETED,
                                });
                              }}
                              className={styles.btnGreenSm}
                            >
                              Complete Run
                            </button>
                            <button
                              type="button"
                              aria-label={`Abort run ${run.id}`}
                              onClick={() => {
                                setConfirmingFinalize({
                                  runId: run.id,
                                  status: RunStatus.ABORTED,
                                });
                              }}
                              className={styles.btnRedSm}
                            >
                              Abort Run
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {pendingCases.length === 0 && (
                      <p className={styles.allDone}>All cases have results recorded.</p>
                    )}

                    {recordedResults.length > 0 && (
                      <div className={styles.recordedSection}>
                        <h4 className={styles.recordedLabel}>
                          Recorded ({recordedResults.length})
                        </h4>
                        <ul className={styles.resultList} role="list">
                          {recordedResults.map((r) => (
                            <li
                              key={r.casePath}
                              className={styles.resultRow}
                              aria-label={`${statusLabel(r.status)}: ${r.casePath}`}
                            >
                              <span
                                className={styles.resultStatusBadge}
                                data-status={ResultStatus[r.status]}
                              >
                                {statusLabel(r.status)}
                              </span>
                              {caseTitleMap.get(r.casePath)?.title && (
                                <span className={styles.resultTitle}>
                                  {caseTitleMap.get(r.casePath)?.title}
                                </span>
                              )}
                              {r.notes && <span className={styles.resultNotes}>{r.notes}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <ul className={styles.pendingList} role="list">
                      {pendingCases.map((c) => (
                        <li key={c.path}>
                          <div className={styles.pendingRow}>
                            <Link
                              href={`${basePath}/cases?case=${encodeURIComponent(c.path)}` as Route}
                              className={styles.pendingPath}
                            >
                              {c.path}
                            </Link>
                            <span className={styles.pendingTitle}>{c.title}</span>
                            {run.status === RunStatus.IN_PROGRESS && (
                              <button
                                type="button"
                                onClick={() => openRecord(c.path)}
                                aria-label={
                                  recordState?.casePath === c.path
                                    ? `Cancel recording ${c.path}`
                                    : `Record result for ${c.path}`
                                }
                                className={styles.btnRecordSm}
                              >
                                {recordState?.casePath === c.path ? "Cancel" : "Record"}
                              </button>
                            )}
                          </div>

                          {recordState?.casePath === c.path && (
                            <div className={styles.recordPanel}>
                              {(recordState.bodyLoading || recordState.body) && (
                                <div className={styles.recordSteps}>
                                  {recordState.bodyLoading ? (
                                    <p className={styles.stepsLoading} role="status">
                                      Loading steps…
                                    </p>
                                  ) : (
                                    recordState.body && (
                                      <MarkdownBody body={recordState.body} maxHeight="200px" />
                                    )
                                  )}
                                </div>
                              )}
                              <form
                                aria-label={`Record result for ${recordState.casePath}`}
                                onSubmit={handleRecord}
                                onKeyDown={(e) => {
                                  if (e.key !== "Escape") return;
                                  e.preventDefault();
                                  setRecordState(null);
                                  lastFocusRef.current?.focus();
                                }}
                                className={styles.recordForm}
                              >
                                <div>
                                  <label className={styles.labelSm}>
                                    Status
                                    <select
                                      value={recordState.status}
                                      onChange={(e) => {
                                        setRecordState(
                                          (s) => s && { ...s, status: Number(e.target.value) }
                                        );
                                      }}
                                      autoFocus
                                      className={styles.inputAuto}
                                    >
                                      <option value={ResultStatus.PASSED}>Passed</option>
                                      <option value={ResultStatus.FAILED}>Failed</option>
                                      <option value={ResultStatus.BLOCKED}>Blocked</option>
                                      <option value={ResultStatus.SKIPPED}>Skipped</option>
                                    </select>
                                  </label>
                                </div>
                                <div className={styles.notesWrap}>
                                  <label
                                    className={
                                      recordState.status === ResultStatus.FAILED ||
                                      recordState.status === ResultStatus.BLOCKED
                                        ? styles.labelSmErr
                                        : styles.labelSm
                                    }
                                  >
                                    Notes
                                    {recordState.status === ResultStatus.FAILED ||
                                    recordState.status === ResultStatus.BLOCKED
                                      ? " *"
                                      : ""}
                                    <input
                                      value={recordState.notes}
                                      onChange={(e) => {
                                        setRecordState((s) => s && { ...s, notes: e.target.value });
                                      }}
                                      placeholder={
                                        recordState.status === ResultStatus.FAILED
                                          ? "Describe what failed…"
                                          : recordState.status === ResultStatus.BLOCKED
                                            ? "Describe what is blocking…"
                                            : "Optional notes…"
                                      }
                                      required={
                                        recordState.status === ResultStatus.FAILED ||
                                        recordState.status === ResultStatus.BLOCKED
                                      }
                                      aria-required={
                                        recordState.status === ResultStatus.FAILED ||
                                        recordState.status === ResultStatus.BLOCKED
                                      }
                                      maxLength={2000}
                                      className={
                                        recordState.status === ResultStatus.FAILED ||
                                        recordState.status === ResultStatus.BLOCKED
                                          ? styles.inputErr
                                          : styles.input
                                      }
                                    />
                                  </label>
                                </div>
                                <button
                                  type="submit"
                                  disabled={recording}
                                  className={styles.btnSaveResult}
                                >
                                  {recording ? "Saving…" : "Save Result"}
                                </button>
                              </form>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
