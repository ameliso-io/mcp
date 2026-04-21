import { useState, useEffect, useCallback, useRef } from "react";
import { client } from "../client";
import { errorMessage } from "../errorMessage";
import type { RunMeta, Case, CaseResult } from "../gen/ameliso/v1/types_pb";
import { RunStatus, ResultStatus } from "../gen/ameliso/v1/types_pb";
import dynamic from "next/dynamic";

const MarkdownBody = dynamic(() => import("./MarkdownBody"), { ssr: false });

interface Props {
  repoId: string;
  initialSuite?: string;
  onInitialSuiteConsumed?: () => void;
}

const card = {
  background: "white",
  borderRadius: "8px",
  padding: "20px",
  border: "1px solid #e2e8f0",
  marginBottom: "16px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontSize: "14px",
  boxSizing: "border-box",
};

function statusColor(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED:
      return "#22c55e";
    case ResultStatus.FAILED:
      return "#ef4444";
    case ResultStatus.BLOCKED:
      return "#f97316";
    case ResultStatus.SKIPPED:
      return "#94a3b8";
    default:
      return "#e2e8f0";
  }
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

function runStatusColor(s: RunStatus): string {
  switch (s) {
    case RunStatus.IN_PROGRESS:
      return "#3b82f6";
    case RunStatus.COMPLETED:
      return "#22c55e";
    case RunStatus.ABORTED:
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

export default function RunsTab({ repoId, initialSuite, onInitialSuiteConsumed }: Props) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus>(RunStatus.UNSPECIFIED);

  // Create run form
  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTester, setNewTester] = useState("");
  const [newEnv, setNewEnv] = useState("");
  const [newSuite, setNewSuite] = useState("");
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

  const consumedRef = useRef(false);
  useEffect(() => {
    if (initialSuite && !consumedRef.current) {
      consumedRef.current = true;
      setNewSuite(initialSuite);
      setShowCreate(true);
      onInitialSuiteConsumed?.();
    }
  }, [initialSuite, onInitialSuiteConsumed]);

  // Auto-refresh pending cases every 30s when viewing an in-progress run
  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pendingPollRef.current) clearInterval(pendingPollRef.current);
    const selectedRun = runs.find((r) => r.id === selectedRunId);
    if (selectedRun && selectedRun.status === RunStatus.IN_PROGRESS) {
      pendingPollRef.current = setInterval(async () => {
        try {
          const res = await client.getPendingCases({ repoId, runId: selectedRunId! });
          setPendingCases(res.cases);
          setTotalInScope(res.totalInScope);
        } catch {
          // silently ignore poll errors
        }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!repoId || !newSlug) return;
    setCreating(true);
    try {
      const created = await client.createRun({
        repoId,
        slug: newSlug,
        tester: newTester,
        environment: newEnv,
        suite: newSuite,
      });
      setShowCreate(false);
      setNewSlug("");
      setNewTester("");
      setNewEnv("");
      setNewSuite("");
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
      return;
    }
    setSelectedRunId(runId);
    setLoadingPending(true);
    setPendingCases([]);
    setRecordedResults([]);
    setResultStatusFilter(null);
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
      setRecordNotes("");
      setRecordStatus(ResultStatus.PASSED);
      setCaseBody(null);
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
    const label = status === RunStatus.COMPLETED ? "complete" : "abort";
    if (!confirm(`Mark run as ${label}?`)) return;
    try {
      await client.finalizeRun({ repoId, runId, status });
      setSelectedRunId(null);
      setPendingCases([]);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleBulkPass(runId: string) {
    if (pendingCases.length === 0) return;
    if (
      !confirm(
        `Mark all ${pendingCases.length} pending case${pendingCases.length !== 1 ? "s" : ""} as Passed?`
      )
    )
      return;
    setBulkPassing(true);
    try {
      for (const c of pendingCases) {
        await client.recordResult({
          repoId,
          runId,
          casePath: c.path,
          status: ResultStatus.PASSED,
          notes: "",
        });
      }
      const pending = await client.getPendingCases({ repoId, runId });
      setPendingCases(pending.cases);
      setTotalInScope(pending.totalInScope);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBulkPassing(false);
    }
  }

  async function handleDeleteRun(runId: string) {
    if (!confirm(`Delete run "${runId}"?`)) return;
    try {
      await client.deleteRun({ repoId, runId });
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        setPendingCases([]);
      }
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!repoId) {
    return (
      <div style={{ color: "#64748b", padding: "40px", textAlign: "center" }}>
        Set a repository path in the Overview tab first.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "700" }}>Runs</h2>
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
              onClick={() => setStatusFilter(opt.value)}
              style={{
                padding: "4px 10px",
                background: statusFilter === opt.value ? "#1e293b" : "transparent",
                color: statusFilter === opt.value ? "white" : "#64748b",
                border: `1px solid ${statusFilter === opt.value ? "#1e293b" : "#e2e8f0"}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "500",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "8px 16px",
            background: "#1e293b",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          {showCreate ? "Cancel" : "+ New Run"}
        </button>
      </div>

      {showCreate && (
        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Create Run</h3>
          <form
            onSubmit={handleCreate}
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
          >
            <div>
              <label
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Slug
              </label>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Tester
              </label>
              <input
                value={newTester}
                onChange={(e) => setNewTester(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Environment
              </label>
              <input
                value={newEnv}
                onChange={(e) => setNewEnv(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Suite (optional)
              </label>
              <input
                value={newSuite}
                onChange={(e) => setNewSuite(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: "8px 20px",
                  background: "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {creating ? "Creating…" : "Create Run"}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div
          style={{
            ...card,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              color: "#991b1b",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: 1,
              padding: "0 0 0 12px",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", color: "#64748b", padding: "40px" }}>Loading…</div>
      )}

      {!loading && runs.length === 0 && !error && (
        <div style={{ ...card, color: "#64748b", textAlign: "center", padding: "40px" }}>
          No runs found.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {runs.map((run) => (
          <div key={run.id}>
            <div
              style={{
                ...card,
                marginBottom: 0,
                cursor: "pointer",
                borderColor: selectedRunId === run.id ? "#3b82f6" : "#e2e8f0",
              }}
              onClick={() => selectRun(run.id, run.status)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: runStatusColor(run.status),
                    background: runStatusColor(run.status) + "18",
                    padding: "3px 8px",
                    borderRadius: "4px",
                  }}
                >
                  {runStatusLabel(run.status)}
                </span>
                <span style={{ fontWeight: "600", fontSize: "15px", flex: 1 }}>{run.id}</span>
                {run.suite && (
                  <span
                    style={{
                      fontSize: "11px",
                      background: "#eff6ff",
                      color: "#3b82f6",
                      padding: "2px 7px",
                      borderRadius: "4px",
                      fontWeight: "600",
                    }}
                  >
                    {run.suite}
                  </span>
                )}
                {run.tester && (
                  <span style={{ fontSize: "13px", color: "#64748b" }}>{run.tester}</span>
                )}
                {run.environment && (
                  <span style={{ fontSize: "13px", color: "#94a3b8" }}>{run.environment}</span>
                )}
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>{run.date}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRun(run.id);
                  }}
                  style={{
                    background: "none",
                    border: "1px solid #fecaca",
                    color: "#ef4444",
                    borderRadius: "4px",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {selectedRunId === run.id && (
              <div
                style={{
                  ...card,
                  marginTop: 0,
                  borderTop: "none",
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  background: "#f8fafc",
                }}
              >
                {loadingPending ? (
                  <div style={{ color: "#64748b", padding: "12px 0" }}>Loading…</div>
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
                            style={{
                              display: "flex",
                              gap: "8px",
                              marginBottom: "14px",
                              flexWrap: "wrap",
                            }}
                          >
                            {[
                              {
                                label: "Passed",
                                count: counts.passed,
                                color: "#16a34a",
                                bg: "#f0fdf4",
                                status: ResultStatus.PASSED,
                              },
                              {
                                label: "Failed",
                                count: counts.failed,
                                color: "#dc2626",
                                bg: "#fef2f2",
                                status: ResultStatus.FAILED,
                              },
                              {
                                label: "Blocked",
                                count: counts.blocked,
                                color: "#ea580c",
                                bg: "#fff7ed",
                                status: ResultStatus.BLOCKED,
                              },
                              {
                                label: "Skipped",
                                count: counts.skipped,
                                color: "#64748b",
                                bg: "#f8fafc",
                                status: ResultStatus.SKIPPED,
                              },
                            ]
                              .filter((s) => s.count > 0)
                              .map((s) => (
                                <button
                                  key={s.label}
                                  onClick={() =>
                                    setResultStatusFilter((rsf) =>
                                      rsf === s.status ? null : s.status
                                    )
                                  }
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    color: s.color,
                                    background:
                                      resultStatusFilter === s.status ? s.color + "30" : s.bg,
                                    border: `1px solid ${resultStatusFilter === s.status ? s.color : s.color + "30"}`,
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                  }}
                                >
                                  {s.count} {s.label}
                                </button>
                              ))}
                            {resultStatusFilter !== null && (
                              <button
                                onClick={() => setResultStatusFilter(null)}
                                style={{
                                  fontSize: "12px",
                                  color: "#64748b",
                                  background: "none",
                                  border: "1px solid #e2e8f0",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                }}
                              >
                                Show all
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    {recordedResults.length === 0 ? (
                      <p style={{ color: "#64748b", fontSize: "14px" }}>No results recorded.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {(resultStatusFilter !== null
                          ? recordedResults.filter((r) => r.status === resultStatusFilter)
                          : recordedResults
                        ).map((r) => (
                          <div
                            key={r.casePath}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 12px",
                              background: "white",
                              borderRadius: "6px",
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: "700",
                                color: statusColor(r.status),
                                background: statusColor(r.status) + "18",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                flexShrink: 0,
                              }}
                            >
                              {statusLabel(r.status)}
                            </span>
                            <span
                              style={{
                                fontSize: "13px",
                                fontFamily: "monospace",
                                color: "#64748b",
                                flexShrink: 0,
                              }}
                            >
                              {r.casePath}
                            </span>
                            {caseTitleMap.get(r.casePath)?.title && (
                              <span style={{ flex: 1, fontSize: "14px", fontWeight: "500" }}>
                                {caseTitleMap.get(r.casePath)!.title}
                              </span>
                            )}
                            {r.notes && (
                              <span
                                style={{ fontSize: "13px", color: "#64748b", fontStyle: "italic" }}
                              >
                                {r.notes}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {totalInScope > 0 && (
                      <div style={{ marginBottom: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "13px",
                            color: "#64748b",
                            marginBottom: "6px",
                          }}
                        >
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
                          style={{
                            height: "6px",
                            background: "#e2e8f0",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${((totalInScope - pendingCases.length) / totalInScope) * 100}%`,
                              background: "#16a34a",
                              borderRadius: "3px",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                        {pendingCases.length} pending
                        <span
                          style={{
                            marginLeft: "8px",
                            fontSize: "10px",
                            fontWeight: "400",
                            color: "#94a3b8",
                          }}
                        >
                          auto-refresh 30s
                        </span>
                      </p>
                      {run.status === RunStatus.IN_PROGRESS && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          {pendingCases.length > 0 && (
                            <button
                              onClick={() => handleBulkPass(run.id)}
                              disabled={bulkPassing}
                              style={{
                                padding: "6px 14px",
                                background: "#0ea5e9",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "13px",
                              }}
                            >
                              {bulkPassing ? "Marking…" : `All Passed (${pendingCases.length})`}
                            </button>
                          )}
                          <button
                            onClick={() => handleFinalize(run.id, RunStatus.COMPLETED)}
                            style={{
                              padding: "6px 14px",
                              background: "#16a34a",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "13px",
                            }}
                          >
                            Complete Run
                          </button>
                          <button
                            onClick={() => handleFinalize(run.id, RunStatus.ABORTED)}
                            style={{
                              padding: "6px 14px",
                              background: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "13px",
                            }}
                          >
                            Abort Run
                          </button>
                        </div>
                      )}
                    </div>

                    {pendingCases.length === 0 && (
                      <p style={{ color: "#64748b", fontSize: "14px" }}>
                        All cases have results recorded.
                      </p>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {pendingCases.map((c) => (
                        <div key={c.path}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 12px",
                              background: "white",
                              borderRadius: "6px",
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            <span style={{ flex: 1, fontSize: "14px", fontFamily: "monospace" }}>
                              {c.path}
                            </span>
                            <span style={{ fontSize: "13px", color: "#64748b" }}>{c.title}</span>
                            {run.status === RunStatus.IN_PROGRESS && (
                              <button
                                onClick={() => openRecord(c.path)}
                                style={{
                                  padding: "5px 12px",
                                  background: "#3b82f6",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                }}
                              >
                                {recordingCase === c.path ? "Cancel" : "Record"}
                              </button>
                            )}
                          </div>

                          {recordingCase === c.path && (
                            <div
                              style={{
                                background: "white",
                                border: "1px solid #e2e8f0",
                                borderTop: "none",
                                borderBottomLeftRadius: "6px",
                                borderBottomRightRadius: "6px",
                              }}
                            >
                              {(caseBodyLoading || caseBody) && (
                                <div
                                  style={{
                                    padding: "12px 16px",
                                    borderBottom: "1px solid #f1f5f9",
                                    background: "#f8fafc",
                                  }}
                                >
                                  {caseBodyLoading ? (
                                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                                      Loading steps…
                                    </p>
                                  ) : (
                                    caseBody && <MarkdownBody body={caseBody} maxHeight="200px" />
                                  )}
                                </div>
                              )}
                              <form
                                onSubmit={handleRecord}
                                style={{
                                  padding: "12px",
                                  display: "flex",
                                  gap: "10px",
                                  alignItems: "flex-end",
                                  flexWrap: "wrap",
                                }}
                              >
                                <div>
                                  <label
                                    style={{
                                      fontSize: "12px",
                                      color: "#64748b",
                                      display: "block",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Status
                                  </label>
                                  <select
                                    value={recordStatus}
                                    onChange={(e) =>
                                      setRecordStatus(Number(e.target.value) as ResultStatus)
                                    }
                                    style={{ ...inputStyle, width: "auto" }}
                                  >
                                    <option value={ResultStatus.PASSED}>Passed</option>
                                    <option value={ResultStatus.FAILED}>Failed</option>
                                    <option value={ResultStatus.BLOCKED}>Blocked</option>
                                    <option value={ResultStatus.SKIPPED}>Skipped</option>
                                  </select>
                                </div>
                                <div style={{ flex: 1, minWidth: "160px" }}>
                                  <label
                                    style={{
                                      fontSize: "12px",
                                      color:
                                        recordStatus === ResultStatus.FAILED ||
                                        recordStatus === ResultStatus.BLOCKED
                                          ? "#dc2626"
                                          : "#64748b",
                                      display: "block",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Notes
                                    {recordStatus === ResultStatus.FAILED ||
                                    recordStatus === ResultStatus.BLOCKED
                                      ? " *"
                                      : ""}
                                  </label>
                                  <input
                                    value={recordNotes}
                                    onChange={(e) => setRecordNotes(e.target.value)}
                                    required={
                                      recordStatus === ResultStatus.FAILED ||
                                      recordStatus === ResultStatus.BLOCKED
                                    }
                                    placeholder={
                                      recordStatus === ResultStatus.FAILED
                                        ? "Describe what failed…"
                                        : recordStatus === ResultStatus.BLOCKED
                                          ? "Describe what is blocking…"
                                          : "Optional notes…"
                                    }
                                    style={{
                                      ...inputStyle,
                                      borderColor:
                                        recordStatus === ResultStatus.FAILED ||
                                        recordStatus === ResultStatus.BLOCKED
                                          ? "#fca5a5"
                                          : "#e2e8f0",
                                    }}
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={recording}
                                  style={{
                                    padding: "8px 16px",
                                    background: "#16a34a",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {recording ? "Saving…" : "Save Result"}
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
