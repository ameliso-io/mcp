"use client";

import type { Route } from "next";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import styles from "./SuitesTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Suite, Case } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";

interface Props {
  repoId: string;
  basePath: string;
  initialExpanded?: string | undefined;
  onExpandedChange?: (slug: string | null) => void;
}

export default function SuitesTab({ repoId, basePath, initialExpanded, onExpandedChange }: Props) {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedCases, setExpandedCases] = useState<Case[]>([]);
  const [expandedCasesLoading, setExpandedCasesLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCases, setNewCases] = useState("");
  const [creating, setCreating] = useState(false);

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const expandingRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);
  const initialExpandedRef = useRef<string | null>(initialExpanded ?? null);
  const onExpandedChangeRef = useRef(onExpandedChange);
  const toggleExpandRef = useRef<(slug: string) => void>((_slug: string) => undefined);
  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
    toggleExpandRef.current = (slug: string) => void toggleExpand(slug);
  });
  const [actionAnnouncement, announce] = useAnnounce();
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // Edit suite state
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCases, setEditCases] = useState("");
  const [editNewSlug, setEditNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function toggleExpand(slug: string) {
    if (expanded === slug) {
      setExpanded(null);
      setExpandedCases([]);
      expandingRef.current = null;
      onExpandedChangeRef.current?.(null);
      return;
    }
    setExpanded(slug);
    setExpandedCases([]);
    expandingRef.current = slug;
    onExpandedChangeRef.current?.(slug);
    setExpandedCasesLoading(true);
    try {
      const res = await client.listCases({ repoId, suite: slug });
      if (expandingRef.current === slug) setExpandedCases(res.cases);
    } catch {
      // silently fall back — suite.cases paths still visible
    } finally {
      if (expandingRef.current === slug) setExpandedCasesLoading(false);
    }
  }

  function startEdit(suite: Suite) {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setEditingSlug(suite.slug);
    setEditName(suite.name);
    setEditDesc(suite.description);
    setEditCases(suite.cases.join(", "));
    setEditNewSlug("");
  }

  const load = useCallback(async () => {
    if (!repoId) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listSuites({ repoId });
      /* v8 ignore next 1 — race guard, covered by stale load test */
      if (id !== loadIdRef.current) return;
      setSuites(res.suites);
    } catch (e) {
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setError(errorMessage(e));
    } finally {
      /* v8 ignore next 1 — race guard */
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-expand suite from URL param after first load
  useEffect(() => {
    const slug = initialExpandedRef.current;
    if (!slug || suites.length === 0) return;
    if (suites.some((s) => s.slug === slug)) {
      initialExpandedRef.current = null;
      toggleExpandRef.current(slug);
    }
  }, [suites]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      /* v8 ignore next 2 — required fields prevent submission when blank */
      if (!repoId || !newSlug || !newName) return;
      setCreating(true);
      try {
        const res = await client.createSuite({
          repoId,
          slug: newSlug,
          name: newName,
          description: newDesc,
          cases: newCases
            ? newCases
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
            : [],
        });
        if (res.suite) {
          const created = res.suite;
          setSuites((prev) =>
            /* v8 ignore next 2 — upsert branch when slug already exists */
            prev.some((s) => s.slug === created.slug)
              ? prev.map((s) => (s.slug === created.slug ? created : s))
              : [...prev, created]
          );
        }
        setShowCreate(false);
        lastFocusRef.current?.focus();
        setNewSlug("");
        setNewName("");
        setNewDesc("");
        setNewCases("");
        announce("Suite created");
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setCreating(false);
      }
    },
    [repoId, newSlug, newName, newDesc, newCases, announce]
  );

  async function handleDelete(slug: string) {
    try {
      await client.deleteSuite({ repoId, slug });
      setSuites((prev) => prev.filter((s) => s.slug !== slug));
      if (expanded === slug) setExpanded(null);
      setConfirmingDelete(null);
      announce("Suite deleted");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const handleUpdate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      /* v8 ignore next 2 — form only renders when editingSlug is set */
      if (!editingSlug) return;
      setSaving(true);
      try {
        const res = await client.updateSuite({
          repoId,
          slug: editingSlug,
          name: editName,
          description: editDesc,
          cases: editCases
            ? editCases
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
            : [],
          replaceCases: true,
          newSlug: editNewSlug,
        });
        if (res.suite) {
          const suite = res.suite;
          /* v8 ignore next 1 — false ternary branch not reached with single-suite test setup */
          setSuites((prev) => prev.map((s) => (s.slug === editingSlug ? suite : s)));
        }
        setEditingSlug(null);
        lastFocusRef.current?.focus();
        announce("Suite updated");
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [editingSlug, repoId, editName, editDesc, editCases, editNewSlug, announce]
  );

  if (!repoId) {
    return (
      <div className={styles.noRepo}>
        Go to the Repositories tab and click &ldquo;Use&rdquo; to select a repository.
      </div>
    );
  }

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {actionAnnouncement}
      </div>
      <div className={styles.header}>
        <h2 className={styles.title}>Suites</h2>
        <button
          type="button"
          onClick={() => {
            if (!showCreate) lastFocusRef.current = document.activeElement as HTMLElement;
            setShowCreate(!showCreate);
          }}
          className={styles.btn}
        >
          {showCreate ? "Cancel" : "+ New Suite"}
        </button>
      </div>

      {showCreate && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Create Suite</h3>
          <form
            aria-label="Create Suite"
            onSubmit={handleCreate}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setShowCreate(false);
                lastFocusRef.current?.focus();
              }
            }}
            className={styles.formGrid}
          >
            <div>
              <label className={styles.label}>
                Slug
                <input
                  value={newSlug}
                  onChange={(e) => {
                    setNewSlug(e.target.value);
                  }}
                  required
                  autoFocus
                  className={styles.input}
                  placeholder="e.g. smoke"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Name
                <input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                  }}
                  required
                  className={styles.input}
                  placeholder="e.g. Smoke Tests"
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>
                Description
                <input
                  value={newDesc}
                  onChange={(e) => {
                    setNewDesc(e.target.value);
                  }}
                  className={styles.input}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>
                Cases (comma-separated paths)
                <input
                  value={newCases}
                  onChange={(e) => {
                    setNewCases(e.target.value);
                  }}
                  className={styles.input}
                  placeholder="auth/login, auth/logout"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <button type="submit" disabled={creating} className={styles.btnGreen}>
                {creating ? "Creating…" : "Create Suite"}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className={styles.errorCard} role="alert">
          <span>{error}</span>
          <div className={styles.errorActions}>
            <button type="button" onClick={load} className={styles.errorRetry}>
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

      {loading && (
        <div className={styles.loadingMsg} role="status">
          Loading…
        </div>
      )}

      {!loading && suites.length === 0 && !error && (
        <div className={styles.emptyCard}>No suites found.</div>
      )}

      <ul className={styles.list} aria-busy={loading} role="list">
        {suites.map((suite) => (
          <li key={suite.slug}>
            {editingSlug === suite.slug ? (
              <div className={styles.card}>
                <h3 className={styles.cardTitleSm}>Edit: {suite.slug}</h3>
                <form
                  aria-label={`Edit suite ${suite.slug}`}
                  onSubmit={handleUpdate}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingSlug(null);
                      lastFocusRef.current?.focus();
                    }
                  }}
                  className={styles.formGridSm}
                >
                  <div>
                    <label className={styles.label}>
                      Name
                      <input
                        value={editName}
                        onChange={(e) => {
                          setEditName(e.target.value);
                        }}
                        required
                        autoFocus
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.label}>
                      Description
                      <input
                        value={editDesc}
                        onChange={(e) => {
                          setEditDesc(e.target.value);
                        }}
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.label}>
                      Cases (comma-separated paths)
                      <input
                        value={editCases}
                        onChange={(e) => {
                          setEditCases(e.target.value);
                        }}
                        className={styles.input}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.label}>
                      Rename slug (optional)
                      <input
                        value={editNewSlug}
                        onChange={(e) => {
                          setEditNewSlug(e.target.value);
                        }}
                        className={styles.input}
                        placeholder="leave blank to keep current slug"
                      />
                    </label>
                  </div>
                  <div className={styles.formActions}>
                    <button type="submit" disabled={saving} className={styles.btnSaveSm}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSlug(null);
                        lastFocusRef.current?.focus();
                      }}
                      className={styles.btnCancelSm}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div
                  className={expanded === suite.slug ? styles.suiteCardExpanded : styles.suiteCard}
                >
                  <div className={styles.suiteRow}>
                    <button
                      type="button"
                      className={styles.suiteExpandBtn}
                      onClick={() => toggleExpand(suite.slug)}
                      aria-expanded={expanded === suite.slug}
                    >
                      <span className={styles.suiteName}>{suite.name}</span>
                      <span className={styles.suiteSlug}>{suite.slug}</span>
                      <span className={styles.caseCount}>
                        {suite.cases.length} case{suite.cases.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    <Link
                      href={`${basePath}/runs?suite=${encodeURIComponent(suite.slug)}` as Route}
                      aria-label={`Run ${suite.slug}`}
                      className={styles.btnGreenSm}
                    >
                      Run
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        startEdit(suite);
                      }}
                      aria-label={`Edit ${suite.slug}`}
                      className={styles.btnOutlineSm}
                    >
                      Edit
                    </button>
                    {confirmingDelete === suite.slug ? (
                      <>
                        <span className={styles.confirmText}>Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(suite.slug)}
                          aria-label={`Confirm delete ${suite.slug}`}
                          className={styles.btnDangerSm}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingDelete(null);
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
                          setConfirmingDelete(suite.slug);
                        }}
                        aria-label={`Delete ${suite.slug}`}
                        className={styles.btnDangerSm}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {suite.description && <p className={styles.suiteDesc}>{suite.description}</p>}
                </div>

                {expanded === suite.slug && (
                  <div className={styles.expandedPanel} aria-busy={expandedCasesLoading}>
                    {expandedCasesLoading ? (
                      <p className={styles.expandedLoading} role="status">
                        Loading…
                      </p>
                    ) : expandedCases.length > 0 ? (
                      <ul className={styles.caseList} role="list">
                        {expandedCases.map((c) => (
                          <li key={c.path} className={styles.caseRow}>
                            <span
                              className={styles.caseDot}
                              data-priority={c.priority}
                              aria-hidden="true"
                            />
                            <span className="sr-only">{c.priority} priority</span>
                            <span className={styles.casePath}>{c.path}</span>
                            <span className={styles.caseTitle}>{c.title}</span>
                            {c.tags.map((t) => (
                              <span key={t} className={styles.tag}>
                                {t}
                              </span>
                            ))}
                          </li>
                        ))}
                      </ul>
                    ) : suite.cases.length > 0 ? (
                      <ul className={styles.caseList} role="list">
                        {suite.cases.map((casePath) => (
                          <li key={casePath} className={styles.casePathOnly}>
                            {casePath}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.noCase}>No cases in this suite.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
