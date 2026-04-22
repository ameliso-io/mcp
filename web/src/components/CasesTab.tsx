"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
  useDeferredValue,
} from "react";
import dynamic from "next/dynamic";
import styles from "./CasesTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case } from "@/gen/ameliso/v1/types_pb";
import { Priority } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";

const MarkdownBody = dynamic(() => import("./MarkdownBody"), { ssr: false });

interface FilterState {
  search: string;
  priority: Priority;
  tag: string;
  sort: "path" | "priority";
}

interface Props {
  repoId: string;
  initialSearch?: string | undefined;
  initialPriorityFilter?: Priority | undefined;
  initialTagFilter?: string | undefined;
  initialSortBy?: "path" | "priority" | undefined;
  onFiltersChange?: (filters: FilterState) => void;
}

function stringToPriority(p: string): Priority {
  switch (p) {
    case "high":
      return Priority.HIGH;
    case "medium":
      return Priority.MEDIUM;
    case "low":
      return Priority.LOW;
    default:
      return Priority.MEDIUM;
  }
}

function priorityLabel(p: string): string {
  switch (p) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "—";
  }
}

export default function CasesTab({
  repoId,
  initialSearch,
  initialPriorityFilter,
  initialTagFilter,
  initialSortBy,
  onFiltersChange,
}: Props) {
  const [cases, setCases] = useState<Case[]>([]);
  const deferredCases = useDeferredValue(cases);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch ?? "");
  const [priorityFilter, setPriorityFilter] = useState<Priority>(
    initialPriorityFilter ?? Priority.UNSPECIFIED
  );
  const [tagFilter, setTagFilter] = useState(initialTagFilter ?? "");
  const [suiteFilter, setSuiteFilter] = useState("");
  const [sortBy, setSortBy] = useState<"path" | "priority">(initialSortBy ?? "priority");
  const [, startSortTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const expandingRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const [actionAnnouncement, announceAction] = useAnnounce();
  const prevCountRef = useRef<number | null>(null);
  const onFiltersChangeRef = useRef(onFiltersChange);
  const filtersInitializedRef = useRef(false);
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  });

  // Create case form
  const [showCreate, setShowCreate] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);
  const [newTags, setNewTags] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  // Expanded case body view
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [expandedBody, setExpandedBody] = useState<string>("");
  const [bodyLoading, setBodyLoading] = useState(false);

  // Edit case form
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>(Priority.MEDIUM);
  const [editTags, setEditTags] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editNewPath, setEditNewPath] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchBody(casePath: string): Promise<string> {
    const res = await client.getCase({ repoId, casePath });
    return res.body;
  }

  async function toggleExpand(casePath: string) {
    if (expandedPath === casePath) {
      setExpandedPath(null);
      setExpandedBody("");
      expandingRef.current = null;
      return;
    }
    setExpandedPath(casePath);
    setExpandedBody("");
    expandingRef.current = casePath;
    setBodyLoading(true);
    try {
      const body = await fetchBody(casePath);
      if (expandingRef.current === casePath) setExpandedBody(body);
    } catch (e) {
      if (expandingRef.current === casePath) {
        setError(errorMessage(e));
        setExpandedPath(null);
      }
    } finally {
      if (expandingRef.current === casePath) setBodyLoading(false);
    }
  }

  async function startEdit(c: Case) {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setEditingPath(c.path);
    setEditTitle(c.title);
    setEditDesc(c.description);
    setEditPriority(stringToPriority(c.priority));
    setEditTags(c.tags.join(", "));
    setEditBody("");
    setEditNewPath("");
    try {
      setEditBody(await fetchBody(c.path));
    } catch {
      // body stays empty; server will preserve existing body on update
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }
    onFiltersChangeRef.current?.({
      search: debouncedSearch,
      priority: priorityFilter,
      tag: tagFilter,
      sort: sortBy,
    });
  }, [debouncedSearch, priorityFilter, tagFilter, sortBy]);

  const load = useCallback(async () => {
    if (!repoId) return;
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listCases({
        repoId,
        query: debouncedSearch,
        priority: priorityFilter,
        tags: tagFilter ? [tagFilter] : [],
        suite: suiteFilter,
      });
      /* v8 ignore next 1 — race guard, covered by stale listCases test */
      if (id !== loadIdRef.current) return;
      setCases(res.cases);
    } catch (e) {
      /* v8 ignore next 1 — race guard */
      if (id !== loadIdRef.current) return;
      setError(errorMessage(e));
    } finally {
      /* v8 ignore next 1 — race guard */
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [repoId, debouncedSearch, priorityFilter, tagFilter, suiteFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const count = deferredCases.length;
    if (prevCountRef.current !== null && prevCountRef.current !== count) {
      announceFilter(`${count} case${count !== 1 ? "s" : ""} found`);
    }
    prevCountRef.current = count;
  }, [deferredCases.length, loading, announceFilter]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      /* v8 ignore next 2 — required fields prevent submission when blank */
      if (!repoId || !newPath || !newTitle) return;
      setCreating(true);
      try {
        await client.createCase({
          repoId,
          casePath: newPath,
          title: newTitle,
          description: newDesc,
          priority: newPriority,
          tags: newTags
            ? newTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          body: newBody,
        });
        setShowCreate(false);
        lastFocusRef.current?.focus();
        setNewPath("");
        setNewTitle("");
        setNewDesc("");
        setNewTags("");
        setNewBody("");
        setNewPriority(Priority.MEDIUM);
        announceAction("Case created");
        load();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setCreating(false);
      }
    },
    [repoId, newPath, newTitle, newDesc, newPriority, newTags, newBody, announceAction, load]
  );

  async function handleDelete(casePath: string) {
    try {
      await client.deleteCase({ repoId, casePath });
      if (expandedPath === casePath) setExpandedPath(null);
      setConfirmingDelete(null);
      announceAction("Case deleted");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const handleUpdate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      /* v8 ignore next 2 — form only renders when editingPath is set */
      if (!editingPath) return;
      setSaving(true);
      try {
        await client.updateCase({
          repoId,
          casePath: editingPath,
          title: editTitle,
          description: editDesc,
          priority: editPriority,
          tags: editTags
            ? editTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          body: editBody,
          newPath: editNewPath,
        });
        setEditingPath(null);
        lastFocusRef.current?.focus();
        announceAction("Case updated");
        load();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [
      editingPath,
      repoId,
      editTitle,
      editDesc,
      editPriority,
      editTags,
      editBody,
      editNewPath,
      announceAction,
      load,
    ]
  );

  const sortedCases = useMemo(
    () =>
      [...deferredCases].sort((a, b) => {
        if (sortBy === "priority") {
          const ord: Record<string, number> = { high: 0, medium: 1, low: 2 };
          const diff = (ord[a.priority] ?? 3) - (ord[b.priority] ?? 3);
          return diff !== 0 ? diff : a.path.localeCompare(b.path);
        }
        return a.path.localeCompare(b.path);
      }),
    [deferredCases, sortBy]
  );

  const allTags = useMemo(
    () => Array.from(new Set(deferredCases.flatMap((c) => c.tags))),
    [deferredCases]
  );

  if (!repoId) {
    return (
      <div className={styles.noRepo}>
        Go to the Repositories tab and click &ldquo;Use&rdquo; to select a repository.
      </div>
    );
  }

  const isStale = cases !== deferredCases;

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {filterAnnouncement}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {actionAnnouncement}
      </div>
      <div className={styles.header}>
        <h2 className={styles.title}>Cases</h2>
        <button
          type="button"
          onClick={() => {
            if (!showCreate) lastFocusRef.current = document.activeElement as HTMLElement;
            setShowCreate(!showCreate);
          }}
          className={styles.btn}
        >
          {showCreate ? "Cancel" : "+ New Case"}
        </button>
      </div>

      {showCreate && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Create Case</h3>
          <form
            aria-label="Create Case"
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
                Path (e.g. auth/login)
                <input
                  value={newPath}
                  onChange={(e) => {
                    setNewPath(e.target.value);
                  }}
                  required
                  autoFocus
                  className={styles.input}
                />
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Title
                <input
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                  }}
                  required
                  className={styles.input}
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
            <div>
              <label className={styles.label}>
                Priority
                <select
                  value={newPriority}
                  onChange={(e) => {
                    setNewPriority(Number(e.target.value));
                  }}
                  className={styles.input}
                >
                  <option value={Priority.LOW}>Low</option>
                  <option value={Priority.MEDIUM}>Medium</option>
                  <option value={Priority.HIGH}>High</option>
                </select>
              </label>
            </div>
            <div>
              <label className={styles.label}>
                Tags (comma-separated)
                <input
                  value={newTags}
                  onChange={(e) => {
                    setNewTags(e.target.value);
                  }}
                  className={styles.input}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>
                Steps / Body (Markdown)
                <textarea
                  value={newBody}
                  onChange={(e) => {
                    setNewBody(e.target.value);
                  }}
                  placeholder={"## Steps\n\n1. \n\n## Expected Result\n\n"}
                  rows={6}
                  className={styles.textarea}
                />
              </label>
            </div>
            <div className={styles.fullCol}>
              <button type="submit" disabled={creating} className={styles.btnGreen}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.filterBar}>
        <input
          type="search"
          aria-label="Search cases"
          placeholder="Search cases…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className={styles.searchInput}
        />
        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(Number(e.target.value));
          }}
          className={styles.filterSelect}
        >
          <option value={Priority.UNSPECIFIED}>All priorities</option>
          <option value={Priority.LOW}>Low</option>
          <option value={Priority.MEDIUM}>Medium</option>
          <option value={Priority.HIGH}>High</option>
        </select>
        {allTags.length > 0 && (
          <select
            aria-label="Filter by tag"
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
            }}
            className={styles.filterSelect}
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          aria-label="Filter by suite slug"
          placeholder="Suite slug…"
          value={suiteFilter}
          onChange={(e) => {
            setSuiteFilter(e.target.value);
          }}
          className={styles.filterSelect}
        />
        <select
          aria-label="Sort cases"
          value={sortBy}
          onChange={(e) => {
            startSortTransition(() => {
              setSortBy(e.target.value as "path" | "priority");
            });
          }}
          className={styles.filterSelect}
        >
          <option value="priority">Sort: Priority</option>
          <option value="path">Sort: Path</option>
        </select>
        {!loading && deferredCases.length > 0 && (
          <span
            className={isStale ? `${styles.caseCount} ${styles.caseCountStale}` : styles.caseCount}
          >
            {deferredCases.length} case{deferredCases.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

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

      {!loading && deferredCases.length === 0 && !error && (
        <div className={styles.emptyCard}>No cases found.</div>
      )}

      <ul
        className={isStale ? `${styles.list} ${styles.listStale}` : styles.list}
        aria-busy={loading || isStale}
        role="list"
      >
        {sortedCases.map((c) => (
          <li key={c.path}>
            <div
              className={
                expandedPath === c.path || editingPath === c.path
                  ? styles.caseCardOpen
                  : styles.caseCard
              }
            >
              {editingPath === c.path ? (
                <form
                  aria-label={`Edit case ${c.path}`}
                  onSubmit={handleUpdate}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingPath(null);
                      lastFocusRef.current?.focus();
                    }
                  }}
                  className={styles.formGridSm}
                >
                  <div>
                    <label className={styles.labelSm}>
                      Title
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        required
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div>
                    <label className={styles.labelSm}>
                      Priority
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(Number(e.target.value) as Priority)}
                        className={styles.input}
                      >
                        <option value={Priority.LOW}>Low</option>
                        <option value={Priority.MEDIUM}>Medium</option>
                        <option value={Priority.HIGH}>High</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.labelSm}>
                      Description
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.labelSm}>
                      Tags (comma-separated)
                      <input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className={styles.input}
                      />
                    </label>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.labelSm}>
                      Steps / Body (Markdown)
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={8}
                        className={styles.textarea}
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
                        setEditingPath(null);
                        lastFocusRef.current?.focus();
                      }}
                      className={styles.btnCancelSm}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.caseRow}>
                  <button
                    type="button"
                    className={styles.caseExpandBtn}
                    onClick={() => toggleExpand(c.path)}
                    aria-expanded={expandedPath === c.path}
                  >
                    <span
                      className={styles.priorityDot}
                      data-priority={c.priority}
                      aria-hidden="true"
                    />
                    <div className={styles.caseInfo}>
                      <div className={styles.caseMeta}>
                        <span className={styles.casePath}>{c.path}</span>
                        <span className={styles.priorityBadge} data-priority={c.priority}>
                          {priorityLabel(c.priority)}
                        </span>
                        {c.tags.map((t) => (
                          <span key={t} className={styles.tag}>
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className={styles.caseTitle}>{c.title}</p>
                      {c.description && <p className={styles.caseDesc}>{c.description}</p>}
                    </div>
                    <span className={styles.chevron} aria-hidden="true">
                      {expandedPath === c.path ? "▲" : "▼"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    aria-label={`Edit ${c.path}`}
                    className={styles.btnOutlineSm}
                  >
                    Edit
                  </button>
                  {confirmingDelete === c.path ? (
                    <>
                      <span className={styles.confirmText}>Delete?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.path)}
                        aria-label={`Confirm delete ${c.path}`}
                        className={styles.btnDangerSm}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
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
                      onClick={() => setConfirmingDelete(c.path)}
                      aria-label={`Delete ${c.path}`}
                      className={styles.btnDangerSm}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>

            {expandedPath === c.path && editingPath !== c.path && (
              <div className={styles.expandedPanel}>
                {bodyLoading ? (
                  <p className={styles.expandedLoading} role="status">
                    Loading…
                  </p>
                ) : expandedBody ? (
                  <MarkdownBody body={expandedBody} />
                ) : (
                  <p className={styles.noBody}>No body.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
