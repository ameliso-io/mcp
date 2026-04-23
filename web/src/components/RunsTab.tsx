"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import styles from "./RunsTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import { useAnnounce } from "@/hooks/useAnnounce";
import { useInterval } from "@/hooks/useInterval";
import type { RunMeta, Case, CaseResult } from "@/gen/ameliso/v1/types_pb";
import { RunStatus, ResultStatus } from "@/gen/ameliso/v1/types_pb";

const MarkdownBody = dynamic(() => import("./MarkdownBody"), { ssr: false });

interface Props {
  repoId: string;
  initialSuite?: string | undefined;
  onInitialSuiteConsumed?: (() => void) | undefined;
  initialStatusFilter?: RunStatus | undefined;
  onStatusFilterChange?: ((s: RunStatus) => void) | undefined;
  initialSelectedRunId?: string | undefined;
  onSelectedRunIdChange?: ((id: string | null) => void) | undefined;
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
  initialSuite,
  onInitialSuiteConsumed,
  initialStatusFilter,
  onStatusFilterChange,
  initialSelectedRunId,
  onSelectedRunIdChange,
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
  const [creating, setCreating] = useState(false);

  // Selected run for recording results or viewing results
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialSelectedRunId ?? null);
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
  const [confirmingFinalize, setConfirmingFinalize] = useState<{
    runId: string;
    status: RunStatus;
  } | null>(null);
  const [confirmingBulkPass, setConfirmingBulkPass] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ runId: string; slug: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [actionAnnouncement, announce] = useAnnounce();

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const consumedRef = useRef(false);
  useEffect(() => {
    if (!initialSuite || consumedRef.current) return;
    consumedRef.current = true;
    setCreateForm((f) => ({ ...f, suite: initialSuite }));
    setShowCreate(true);
    onInitialSuiteConsumed?.();
  }, [initialSuite, onInitialSuiteConsumed]);

  const consumedSelectedRef = useRef(false);
  useEffect(() => {
    if (!initialSelectedRunId || consumedSelectedRef.current || runs.length === 0) return;
    consumedSelectedRef.current = true;
    const run = runs.find((r) => r.id === initialSelectedRunId);
    if (run) void selectRun(run.id, run.status);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, initialSelectedRunId]);

  // Auto-refresh pending cases every 30s when viewing an in-progress run
  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const isSelectedInProgress = selectedRun?.status === RunStatus.IN_PROGRESS && !!selectedRunId;
  useInterval(
    async () => {
      /* v8 ignore next 2 — guard for stale interval after deselect */
      if (!selectedRunId) return;
      try {
        const res = await client.getPendingCases({ repoId, runId: selectedRunId });
        setPendingCases(res.cases);
        setTotalInScope(res.totalInScope);
      } catch {
        // silently ignore poll errors
      }
    },
    isSelectedInProgress ? 30_000 : null
  );

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const { signal } = ctrl;
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
  }, [repoId, statusFilter]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

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
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setCreateForm({ slug: "", tester: "", env: "", suite: "", cases: "" });
      announce("Run created");
      await load();
      // Auto-expand the newly created run
      if (created.run) {
        await selectRun(created.run.id, created.run.status);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function selectRun(runId: string, status: RunStatus) {
    if (selectedRunId === runId) {
      setSelectedRunId(null);
      onSelectedRunIdChange?.(null);
      setPendingCases([]);
      setRecordedResults([]);
      setResultStatusFilter(null);
      setRecordState(null);
      return;
    }
    setSelectedRunId(runId);
    onSelectedRunIdChange?.(runId);
    setLoadingPending(true);
    setPendingCases([]);
    setRecordedResults([]);
    setResultStatusFilter(null);
    setRecordState(null);
    try {
      if (status === RunStatus.IN_PROGRESS) {
        const res = await client.getPendingCases({ repoId, runId });
        setPendingCases(res.cases);
        setTotalInScope(res.totalInScope);
      } else {
        const [runRes, casesRes] = await Promise.all([
          client.getRun({ repoId, runId }),
          client.listCases({ repoId }),
        ]);
        setRecordedResults(runRes.run?.results ?? []);
        setCaseTitleMap(new Map(casesRes.cases.map((c) => [c.path, c])));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingPending(false);
    }
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — record form only shown when both are set */
    if (!selectedRunId || !recordState) return;
    setRecording(true);
    try {
      await client.recordResult({
        repoId,
        runId: selectedRunId,
        casePath: recordState.casePath,
        status: recordState.status,
        notes: recordState.notes,
      });
      setRecordState(null);
      lastFocusRef.current?.focus();
      announce("Result recorded");
      // Refresh pending
      const res = await client.getPendingCases({ repoId, runId: selectedRunId });
      setPendingCases(res.cases);
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
      await client.finalizeRun({ repoId, runId, status });
      setSelectedRunId(null);
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
    try {
      await client.deleteRun({ repoId, runId });
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        setPendingCases([]);
        setRecordState(null);
      }
      setConfirmingDeleteRun(null);
      announce("Run deleted");
      void load();
    } catch (e) {
      setError(errorMessage(e));
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

  const resultCounts = useMemo(() => {
    let passed = 0,
      failed = 0,
      blocked = 0,
      skipped = 0;
    for (const r of recordedResults) {
      if (r.status === ResultStatus.PASSED) passed++;
      else if (r.status === ResultStatus.FAILED) failed++;
      else if (r.status === ResultStatus.BLOCKED) blocked++;
      else if (r.status === ResultStatus.SKIPPED) skipped++;
    }
    return { passed, failed, blocked, skipped };
  }, [recordedResults]);

  const filteredResults = useMemo(
    () =>
      resultStatusFilter !== null
        ? recordedResults.filter((r) => r.status === resultStatusFilter)
        : recordedResults,
    [recordedResults, resultStatusFilter]
  );

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {actionAnnouncement}
      </div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Runs</h2>
          <div role="group" aria-label="Filter by status">
            {(
              [
                { label: "All", value: RunStatus.UNSPECIFIED },
                { label: "In Progress", value: RunStatus.IN_PROGRESS },
                { label: "Completed", value: RunStatus.COMPLETED },
                { label: "Aborted", value: RunStatus.ABORTED },
              ] as { label: string; value: RunStatus }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStatusFilter(opt.value);
                  onStatusFilterChange?.(opt.value);
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
              <label className={styles.label}>
                Slug
                <input
                  value={createForm.slug}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  required
                  autoFocus
                  className={styles.input}
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
                  className={styles.input}
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
                  className={styles.input}
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
      )}

      {loading && (
        <div className={styles.loadingMsg} role="status">
          Loading…
        </div>
      )}

      {!loading && runs.length === 0 && !error && (
        <div className={styles.emptyCard}>No runs found.</div>
      )}

      <ul className={styles.list} aria-busy={loading} role="list">
        {runs.map((run) => (
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
                      className={styles.btnDangerSm}
                    >
                      Yes
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
              <div className={styles.expandedPanel}>
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
                                setResultStatusFilter((rsf) =>
                                  rsf === s.status ? null : s.status
                                );
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
                      <ul className={styles.resultList} role="list">
                        {filteredResults.map((r) => (
                          <li key={r.casePath} className={styles.resultRow}>
                            <span
                              className={styles.resultStatusBadge}
                              data-status={ResultStatus[r.status]}
                            >
                              {statusLabel(r.status)}
                            </span>
                            <span className={styles.resultPath}>{r.casePath}</span>
                            {caseTitleMap.get(r.casePath)?.title && (
                              <span className={styles.resultTitle}>
                                {caseTitleMap.get(r.casePath)?.title}
                              </span>
                            )}
                            {r.notes && <span className={styles.resultNotes}>{r.notes}</span>}
                          </li>
                        ))}
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
                        <span className={styles.refreshHint}>auto-refresh 30s</span>
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

                    <ul className={styles.pendingList} role="list">
                      {pendingCases.map((c) => (
                        <li key={c.path}>
                          <div className={styles.pendingRow}>
                            <span className={styles.pendingPath}>{c.path}</span>
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
