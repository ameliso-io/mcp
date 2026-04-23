"use client";

import type { Route } from "next";
import { useState, useEffect, useCallback, useRef, useDeferredValue } from "react";
import Link from "next/link";
import styles from "./SuitesTab.module.css";
import InlineError from "@/components/InlineError";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Suite, Case } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";
import { useAbortController } from "@/hooks/useAbortController";

interface Props {
  repoId: string;
  basePath: string;
  initialExpanded?: string | undefined;
  onExpandedChange?: ((slug: string | null) => void) | undefined;
}

export default function SuitesTab({ repoId, basePath, initialExpanded, onExpandedChange }: Props) {
  const [suites, setSuites] = useState<Suite[]>([]);
  const deferredSuites = useDeferredValue(suites);
  const isSuitesStale = suites !== deferredSuites;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedCases, setExpandedCases] = useState<Case[]>([]);
  const [expandedCasesLoading, setExpandedCasesLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ slug: "", name: "", desc: "", cases: "" });
  const [creating, setCreating] = useState(false);

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const expandingRef = useRef<string | null>(null);
  const expandedRef = useRef(expanded);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);
  const initialExpandedRef = useRef<string | null>(initialExpanded ?? null);
  const onExpandedChangeRef = useRef(onExpandedChange);
  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  });
  const [actionAnnouncement, announce] = useAnnounce();
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // Edit suite state
  const [editState, setEditState] = useState<{
    slug: string;
    name: string;
    desc: string;
    cases: string;
    newSlug: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleExpand = useCallback(
    async (slug: string) => {
      if (expandedRef.current === slug) {
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
    },
    [repoId]
  );

  function startEdit(suite: Suite) {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setEditState({
      slug: suite.slug,
      name: suite.name,
      desc: suite.description,
      cases: suite.cases.join(", "),
      newSlug: "",
    });
  }

  const nextAbort = useAbortController();

  const load = useCallback(async () => {
    const signal = nextAbort();
    setLoading(true);
    setError(null);
    try {
      const res = await client.listSuites({ repoId }, { signal });
      /* v8 ignore next 2 — abort guard */
      if (signal.aborted) return;
      setSuites(res.suites);
    } catch (e) {
      /* v8 ignore next 2 — abort guard */
      if (signal.aborted) return;
      setError(errorMessage(e));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [repoId, nextAbort]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-expand suite from URL param after first load
  useEffect(() => {
    const slug = initialExpandedRef.current;
    if (!slug || suites.length === 0) return;
    /* v8 ignore next — initialExpandedRef only set when suite exists */
    if (!suites.some((s) => s.slug === slug)) return;
    initialExpandedRef.current = null;
    void toggleExpand(slug);
  }, [suites, toggleExpand]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — required fields prevent submission when blank */
    if (!repoId || !createForm.slug || !createForm.name) return;
    setCreating(true);
    try {
      await client.createSuite({
        repoId,
        slug: createForm.slug,
        name: createForm.name,
        description: createForm.desc,
        cases: createForm.cases
          ? createForm.cases
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : [],
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setCreateForm({ slug: "", name: "", desc: "", cases: "" });
      announce("Suite created");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(slug: string) {
    try {
      await client.deleteSuite({ repoId, slug });
      if (expanded === slug) {
        setExpanded(null);
        onExpandedChangeRef.current?.(null);
      }
      setConfirmingDelete(null);
      announce("Suite deleted");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — form only renders when editState is set */
    if (!editState) return;
    setSaving(true);
    try {
      await client.updateSuite({
        repoId,
        slug: editState.slug,
        name: editState.name,
        description: editState.desc,
        cases: editState.cases
          ? editState.cases
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : [],
        replaceCases: true,
        newSlug: editState.newSlug,
      });
      setEditState(null);
      lastFocusRef.current?.focus();
      announce("Suite updated");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
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
                  placeholder="e.g. smoke"
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Name
                <input
                  value={createForm.name}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, name: e.target.value }));
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
                  value={createForm.desc}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, desc: e.target.value }));
                  }}
                  className={styles.input}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>
                Cases (comma-separated paths)
                <input
                  value={createForm.cases}
                  onChange={(e) => {
                    setCreateForm((f) => ({ ...f, cases: e.target.value }));
                  }}
                  className={styles.input}
                  placeholder="auth/login, auth/logout"
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
        <InlineError
          error={error}
          onDismiss={() => {
            setError(null);
          }}
        />
      )}

      {loading && suites.length === 0 && (
        <div className={styles.loadingMsg} role="status">
          Loading…
        </div>
      )}

      {!loading && suites.length === 0 && !error && (
        <div className={styles.emptyCard}>No suites found.</div>
      )}

      <ul
        className={
          (loading && suites.length > 0) || isSuitesStale
            ? `${styles.list} ${styles.listStale}`
            : styles.list
        }
        aria-busy={loading || isSuitesStale}
        role="list"
      >
        {deferredSuites.map((suite) => (
          <li key={suite.slug}>
            {editState?.slug === suite.slug ? (
              <div className={styles.card}>
                <h3 className={styles.cardTitleSm}>Edit: {suite.slug}</h3>
                <form
                  aria-label={`Edit suite ${suite.slug}`}
                  onSubmit={handleUpdate}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.preventDefault();
                    setEditState(null);
                    lastFocusRef.current?.focus();
                  }}
                  className={styles.formGridSm}
                >
                  <div>
                    <label className={styles.label}>
                      Name
                      <input
                        value={editState.name}
                        onChange={(e) => {
                          setEditState((s) => s && { ...s, name: e.target.value });
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
                        value={editState.desc}
                        onChange={(e) => {
                          setEditState((s) => s && { ...s, desc: e.target.value });
                        }}
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.label}>
                      Cases (comma-separated paths)
                      <input
                        value={editState.cases}
                        onChange={(e) => {
                          setEditState((s) => s && { ...s, cases: e.target.value });
                        }}
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.label}>
                      Rename slug (optional)
                      <input
                        value={editState.newSlug}
                        onChange={(e) => {
                          setEditState((s) => s && { ...s, newSlug: e.target.value });
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
                        setEditState(null);
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
                  <div className={styles.expandedPanel}>
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
                            <Link
                              href={`${basePath}/cases?case=${encodeURIComponent(c.path)}` as Route}
                              className={styles.casePath}
                            >
                              {c.path}
                            </Link>
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
                            <Link
                              href={
                                `${basePath}/cases?case=${encodeURIComponent(casePath)}` as Route
                              }
                              className={styles.casePathOnlyLink}
                            >
                              {casePath}
                            </Link>
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
