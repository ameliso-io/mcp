"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import styles from "./RunsTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import { useAnnounce } from "@/hooks/useAnnounce";
import type { RunMeta, Case, CaseResult } from "@/gen/ameliso/v1/types_pb";
import { RunStatus, ResultStatus } from "@/gen/ameliso/v1/types_pb";

const MarkdownBody = dynamic(() => import("./MarkdownBody"), { ssr: false });

interface Props {
  repoId: string;
  initialSuite?: string;
  onInitialSuiteConsumed?: () => void;
  initialStatusFilter?: RunStatus;
  onStatusFilterChange?: (s: RunStatus) => void;
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
}: Props) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus>(
    initialStatusFilter ?? RunStatus.UNSPECIFIED
  );

  // Create run form
  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTester, setNewTester] = useState("");
  const [newEnv, setNewEnv] = useState("");
  const [newSuite, setNewSuite] = useState("");
  const [newCases, setNewCases] = useState("");
  const [newCommitSha, setNewCommitSha] = useState("");
  const [creating, setCreating] = useState(false);

  // Selected run for recording results or viewing results
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingCases, setPendingCases] = useState<Case[]>([]);
  const [totalInScope, setTotalInScope] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);
  const [recordedResults, setRecordedResults] = useState<CaseResult[]>([]);
  const [resultStatusFilter, setResultStatusFilter] = useState<ResultStatus | null>(null);
  const [caseTitleMap, setCaseTitleMap] = useState<Map<string, Case>>(new Map());

  // Record result form
  const [recordingCase, setRecordingCase] = useState<string | null>(null);
  const [recordStatus, setRecordStatus] = useState<ResultStatus>(ResultStatus.PASSED);
  const [recordNotes, setRecordNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [caseBody, setCaseBody] = useState<string | null>(null);
  const [caseBodyLoading, setCaseBodyLoading] = useState(false);
  const [bulkPassing, setBulkPassing] = useState(false);

  const [confirmingDeleteRun, setConfirmingDeleteRun] = useState<string | null>(null);
  const [deletingRun, setDeletingRun] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState<{
    runId: string;
    status: RunStatus;
  } | null>(null);
  const [confirmingBulkPass, setConfirmingBulkPass] = useState<string | null>(null);
  const [renamingRunId, setRenamingRunId] = useState<string | null>(null);
  const [renameNewSlug, setRenameNewSlug] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [runSearch, setRunSearch] = useState("");
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const prevRunFilterCountRef = useRef<number | null>(null);
  const [actionAnnouncement, announce] = useAnnounce();

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const consumedRef = useRef(false);
  useEffect(() => {
    if (!initialSuite || consumedRef.current) return;
    consumedRef.current = true;
    setNewSuite(initialSuite);
    setShowCreate(true);
    onInitialSuiteConsumed?.();
  }, [initialSuite, onInitialSuiteConsumed]);

  const [pollFailCount, setPollFailCount] = useState(0);

  // Auto-refresh pending cases every 30s when viewing an in-progress run
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
  }, [repoId, selectedRunId, runs]);

  const load = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listRuns({ repoId, status: statusFilter });
      setRuns(res.runs);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [repoId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — required fields prevent submission when blank */
    if (!repoId || !newSlug) return;
    setCreating(true);
    try {
      const created = await client.createRun({
        repoId,
        slug: newSlug,
        tester: newTester,
        environment: newEnv,
        suite: newSuite,
        cases: newCases
          ? newCases
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : [],
        commitSha: newCommitSha,
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setNewSlug("");
      setNewTester("");
      setNewEnv("");
      setNewSuite("");
      setNewCases("");
      setNewCommitSha("");
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
      setPendingCases([]);
      setRecordedResults([]);
      setResultStatusFilter(null);
      setRecordingCase(null);
      setCaseBody(null);
      return;
    }
    setSelectedRunId(runId);
    setLoadingPending(true);
    setPendingCases([]);
    setRecordedResults([]);
    setResultStatusFilter(null);
    setRecordingCase(null);
    setCaseBody(null);
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
    if (recordingCase === casePath) {
      setRecordingCase(null);
      setCaseBody(null);
      return;
    }
    lastFocusRef.current = document.activeElement as HTMLElement;
    setRecordingCase(casePath);
    setRecordNotes("");
    setRecordStatus(ResultStatus.PASSED);
    setCaseBody(null);
    setCaseBodyLoading(true);
    try {
      const res = await client.getCase({ repoId, casePath });
      setCaseBody(res.body || null);
    } catch {
      // body unavailable; proceed without it
    } finally {
      setCaseBodyLoading(false);
    }
  }

  async function handleFinalize(runId: string, status: RunStatus) {
    setConfirmingFinalize(null);
    try {
      await client.finalizeRun({ repoId, runId, status });
      setSelectedRunId(null);
      setPendingCases([]);
      announce(status === RunStatus.COMPLETED ? "Run completed" : "Run aborted");
      await load();
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
      setRecordingCase(null);
      setCaseBody(null);
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
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        setPendingCases([]);
        setRecordingCase(null);
        setCaseBody(null);
      }
      setConfirmingDeleteRun(null);
      announce("Run deleted");
      await load();
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
      await client.updateRun({ repoId, runId: renamingRunId, newSlug: renameNewSlug });
      setRenamingRunId(null);
      setRenameNewSlug("");
      lastFocusRef.current?.focus();
      announce("Run renamed");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRenaming(false);
    }
  }

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

  if (!repoId) {
    return <div className={styles.noRepo}>Set a repository path in the Overview tab first.</div>;
  }

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
              <label className={`${styles.label} ${styles.requiredLabel}`}>
                Slug
                <input
                  value={newSlug}
                  onChange={(e) => {
                    setNewSlug(e.target.value);
                  }}
                  required
                  pattern="[a-z0-9_-]+"
                  title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)"
                  maxLength={100}
                  autoFocus
                  className={styles.input}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Tester
                <input
                  value={newTester}
                  onChange={(e) => {
                    setNewTester(e.target.value);
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
                  value={newEnv}
                  onChange={(e) => {
                    setNewEnv(e.target.value);
                  }}
                  maxLength={255}
                  className={styles.input}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Suite (optional)
                <input
                  value={newSuite}
                  onChange={(e) => {
                    setNewSuite(e.target.value);
                  }}
                  maxLength={100}
                  className={styles.input}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>
                Inline cases (optional, comma-separated paths)
                <input
                  value={newCases}
                  onChange={(e) => {
                    setNewCases(e.target.value);
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

      {loading && (
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
                {renamingRunId !== run.id && (
                  <button
                    type="button"
                    onClick={() => {
                      lastFocusRef.current = document.activeElement as HTMLElement;
                      setRenamingRunId(run.id);
                      setRenameNewSlug("");
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
              {renamingRunId === run.id && (
                <form
                  aria-label={`Rename run ${run.id}`}
                  onSubmit={handleRenameRun}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.preventDefault();
                    setRenamingRunId(null);
                    lastFocusRef.current?.focus();
                  }}
                  className={styles.renameForm}
                >
                  <span className={styles.renamePrefix}>{run.id.slice(0, 10)}-</span>
                  <input
                    value={renameNewSlug}
                    onChange={(e) => {
                      setRenameNewSlug(e.target.value);
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
                      setRenamingRunId(null);
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
                    {recordedResults.length > 0 &&
                      (() => {
                        const counts = {
                          passed: recordedResults.filter((r) => r.status === ResultStatus.PASSED)
                            .length,
                          failed: recordedResults.filter((r) => r.status === ResultStatus.FAILED)
                            .length,
                          blocked: recordedResults.filter((r) => r.status === ResultStatus.BLOCKED)
                            .length,
                          skipped: recordedResults.filter((r) => r.status === ResultStatus.SKIPPED)
                            .length,
                        };
                        return (
                          <div
                            className={styles.resultFilters}
                            role="group"
                            aria-label="Filter by result status"
                          >
                            {[
                              {
                                label: "Passed",
                                count: counts.passed,
                                status: ResultStatus.PASSED,
                              },
                              {
                                label: "Failed",
                                count: counts.failed,
                                status: ResultStatus.FAILED,
                              },
                              {
                                label: "Blocked",
                                count: counts.blocked,
                                status: ResultStatus.BLOCKED,
                              },
                              {
                                label: "Skipped",
                                count: counts.skipped,
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
                        );
                      })()}
                    {recordedResults.length === 0 ? (
                      <p className={styles.noResults}>No results recorded.</p>
                    ) : (
                      <ul className={styles.resultList} role="list">
                        {(resultStatusFilter !== null
                          ? recordedResults.filter((r) => r.status === resultStatusFilter)
                          : recordedResults
                        ).map((r) => (
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

                    <ul className={styles.pendingList} role="list">
                      {pendingCases.map((c) => (
                        <li key={c.path}>
                          <div className={styles.pendingRow}>
                            <span className={styles.pendingPath}>{c.path}</span>
                            <span className={styles.pendingTitle}>{c.title}</span>
                            <button
                              type="button"
                              onClick={() => openRecord(c.path)}
                              aria-label={
                                recordingCase === c.path
                                  ? `Cancel recording ${c.path}`
                                  : `Record result for ${c.path}`
                              }
                              className={styles.btnRecordSm}
                            >
                              {recordingCase === c.path ? "Cancel" : "Record"}
                            </button>
                          </div>

                          {recordingCase === c.path && (
                            <div className={styles.recordPanel}>
                              {(caseBodyLoading || caseBody) && (
                                <div className={styles.recordSteps}>
                                  {caseBodyLoading ? (
                                    <p className={styles.stepsLoading} role="status">
                                      Loading steps…
                                    </p>
                                  ) : (
                                    caseBody && <MarkdownBody body={caseBody} maxHeight="200px" />
                                  )}
                                </div>
                              )}
                              <form
                                aria-label={`Record result for ${recordingCase}`}
                                onSubmit={handleRecord}
                                onKeyDown={(e) => {
                                  if (e.key !== "Escape") return;
                                  e.preventDefault();
                                  setRecordingCase(null);
                                  setCaseBody(null);
                                  lastFocusRef.current?.focus();
                                }}
                                className={styles.recordForm}
                              >
                                <div>
                                  <label className={styles.labelSm}>
                                    Status
                                    <select
                                      value={recordStatus}
                                      onChange={(e) => {
                                        setRecordStatus(Number(e.target.value));
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
                                      recordStatus === ResultStatus.FAILED ||
                                      recordStatus === ResultStatus.BLOCKED
                                        ? styles.labelSmErr
                                        : styles.labelSm
                                    }
                                  >
                                    Notes
                                    {recordStatus === ResultStatus.FAILED ||
                                    recordStatus === ResultStatus.BLOCKED
                                      ? " *"
                                      : ""}
                                    <input
                                      value={recordNotes}
                                      onChange={(e) => {
                                        setRecordNotes(e.target.value);
                                      }}
                                      placeholder={
                                        recordStatus === ResultStatus.FAILED
                                          ? "Describe what failed…"
                                          : recordStatus === ResultStatus.BLOCKED
                                            ? "Describe what is blocking…"
                                            : "Optional notes…"
                                      }
                                      required={
                                        recordStatus === ResultStatus.FAILED ||
                                        recordStatus === ResultStatus.BLOCKED
                                      }
                                      aria-required={
                                        recordStatus === ResultStatus.FAILED ||
                                        recordStatus === ResultStatus.BLOCKED
                                      }
                                      maxLength={2000}
                                      className={
                                        recordStatus === ResultStatus.FAILED ||
                                        recordStatus === ResultStatus.BLOCKED
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
