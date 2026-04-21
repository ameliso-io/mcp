"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { client } from "../client";
import { errorMessage } from "../errorMessage";
import type { AffectedCase, CoverageEntry, RunMeta } from "../gen/ameliso/v1/types_pb";
import { ResultStatus, RunStatus } from "../gen/ameliso/v1/types_pb";

interface Props {
  repoId: string;
  onGoToRuns?: () => void;
}

const card = {
  background: "white",
  borderRadius: "8px",
  padding: "20px",
  border: "1px solid #e2e8f0",
  marginBottom: "16px",
};

const label = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: "6px",
};

function statusSortOrder(s: ResultStatus): number {
  switch (s) {
    case ResultStatus.FAILED:
      return 0;
    case ResultStatus.BLOCKED:
      return 1;
    case ResultStatus.NEVER:
      return 2;
    case ResultStatus.SKIPPED:
      return 3;
    case ResultStatus.PASSED:
      return 4;
    default:
      return 5;
  }
}

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
    case ResultStatus.NEVER:
      return "#e2e8f0";
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
    case ResultStatus.NEVER:
      return "Never run";
    default:
      return "Unknown";
  }
}

export default function OverviewTab({ repoId, onGoToRuns }: Props) {
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeRuns, setActiveRuns] = useState<RunMeta[]>([]);

  const [sinceRef, setSinceRef] = useState("");
  const [affected, setAffected] = useState<AffectedCase[] | null>(null);
  const [affectedLoading, setAffectedLoading] = useState(false);
  const [affectedError, setAffectedError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const [coverageRes, activeRunsRes] = await Promise.all([
        client.getCoverageReport({ repoId: path }),
        client.listRuns({ repoId: path, status: RunStatus.IN_PROGRESS }),
      ]);
      setEntries(coverageRes.entries);
      setRunCount(coverageRes.runCount);
      setActiveRuns(activeRunsRes.runs);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (repoId) {
      load(repoId);
    }
  }, [repoId, load]);

  // Auto-refresh every 30s while there are active runs
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (repoId && activeRuns.length > 0) {
      pollRef.current = setInterval(() => load(repoId), 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [repoId, activeRuns.length, load]);

  async function handleAffected(e: React.FormEvent) {
    e.preventDefault();
    if (!repoId) return;
    setAffectedLoading(true);
    setAffectedError(null);
    try {
      const res = await client.getAffectedCases({ repoId, sinceRef });
      setAffected(res.cases);
    } catch (err) {
      setAffectedError(errorMessage(err));
    } finally {
      setAffectedLoading(false);
    }
  }

  const statCases = entries.length;
  const statPassed = entries.filter((e) => e.latestStatus === ResultStatus.PASSED).length;
  const statFailed = entries.filter((e) => e.latestStatus === ResultStatus.FAILED).length;
  const statNever = entries.filter((e) => e.latestStatus === ResultStatus.NEVER).length;

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: "20px", fontSize: "22px", fontWeight: "700" }}>
        Overview
      </h2>

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

      {!repoId && !loading && (
        <div style={{ ...card, color: "#64748b", padding: "32px", textAlign: "center" }}>
          <p style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: "600", color: "#334155" }}>
            No repository selected
          </p>
          <p style={{ margin: 0, fontSize: "14px" }}>
            Go to the Repositories tab and click "Use" on a connected repository.
          </p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", color: "#64748b", padding: "40px" }}>Loading…</div>
      )}

      {!loading && entries.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            {[
              { label: "Total Cases", value: statCases, color: "#1e293b" },
              { label: "Passed", value: statPassed, color: "#16a34a" },
              { label: "Failed", value: statFailed, color: "#dc2626" },
              { label: "Never Run", value: statNever, color: "#94a3b8" },
            ].map((stat) => (
              <div key={stat.label} style={{ ...card, marginBottom: 0 }}>
                <p style={label}>{stat.label}</p>
                <p style={{ margin: 0, fontSize: "32px", fontWeight: "700", color: stat.color }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {activeRuns.length > 0 && (
            <div style={{ ...card, border: "1px solid #bfdbfe", background: "#eff6ff" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <p style={{ ...label, color: "#3b82f6", margin: 0 }}>
                  Active Runs ({activeRuns.length})
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "10px",
                      fontWeight: "400",
                      color: "#93c5fd",
                    }}
                  >
                    auto-refresh 30s
                  </span>
                </p>
                {onGoToRuns && (
                  <button
                    onClick={onGoToRuns}
                    style={{
                      background: "none",
                      border: "1px solid #bfdbfe",
                      color: "#3b82f6",
                      borderRadius: "6px",
                      padding: "4px 12px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "600",
                    }}
                  >
                    Go to Runs
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeRuns.map((run) => (
                  <div
                    key={run.id}
                    style={{
                      padding: "12px",
                      background: "white",
                      borderRadius: "6px",
                      border: "1px solid #dbeafe",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "600",
                        fontSize: "14px",
                        flex: 1,
                        fontFamily: "monospace",
                      }}
                    >
                      {run.id}
                    </span>
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
                      <span style={{ fontSize: "12px", color: "#64748b" }}>{run.tester}</span>
                    )}
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{run.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={card}>
            <p style={{ ...label, marginBottom: "12px" }}>
              Coverage ({runCount} run{runCount !== 1 ? "s" : ""})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[...entries]
                .sort((a, b) => statusSortOrder(a.latestStatus) - statusSortOrder(b.latestStatus))
                .map((entry) => (
                  <div
                    key={entry.case?.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: "6px",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: statusColor(entry.latestStatus),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, fontSize: "14px", fontFamily: "monospace" }}>
                      {entry.case?.path}
                    </span>
                    <span style={{ fontSize: "13px", color: "#64748b" }}>{entry.case?.title}</span>
                    {entry.lastRunDate && (
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                        {entry.lastRunDate}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: statusColor(entry.latestStatus),
                      }}
                    >
                      {statusLabel(entry.latestStatus)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {!loading && !error && repoId && entries.length === 0 && (
        <div style={{ ...card, color: "#64748b", textAlign: "center", padding: "40px" }}>
          No cases found in this repository.
        </div>
      )}

      {repoId && (
        <div style={card}>
          <p style={{ ...label, marginBottom: "12px" }}>Affected Cases by Git Diff</p>
          <form
            onSubmit={handleAffected}
            style={{ display: "flex", gap: "8px", marginBottom: "12px" }}
          >
            <input
              type="text"
              value={sinceRef}
              onChange={(e) => setSinceRef(e.target.value)}
              placeholder="Since ref (default: last run commit)"
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
            <button
              type="submit"
              disabled={affectedLoading}
              style={{
                padding: "8px 16px",
                background: "#1e293b",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                whiteSpace: "nowrap",
              }}
            >
              {affectedLoading ? "Checking…" : "Check Diff"}
            </button>
          </form>
          {affectedError && (
            <div
              style={{
                color: "#991b1b",
                fontSize: "13px",
                marginBottom: "8px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{affectedError}</span>
              <button
                onClick={() => setAffectedError(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#991b1b",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "0 0 0 8px",
                }}
              >
                ×
              </button>
            </div>
          )}
          {affected !== null &&
            (affected.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
                No cases affected by this diff.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[...affected]
                  .sort((a, b) => {
                    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
                    return (
                      (order[a.case?.priority ?? ""] ?? 3) - (order[b.case?.priority ?? ""] ?? 3)
                    );
                  })
                  .map((ac, idx) => (
                    <div
                      key={ac.case?.path ?? idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 12px",
                        background: "#f8fafc",
                        borderRadius: "6px",
                      }}
                    >
                      {ac.case?.priority && (
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background:
                              ac.case.priority === "high"
                                ? "#ef4444"
                                : ac.case.priority === "medium"
                                  ? "#f97316"
                                  : "#22c55e",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{ flex: 1, fontSize: "14px", fontFamily: "monospace" }}>
                        {ac.case?.path}
                      </span>
                      <span style={{ fontSize: "13px", color: "#64748b" }}>{ac.case?.title}</span>
                      <span style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                        {ac.reason}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
