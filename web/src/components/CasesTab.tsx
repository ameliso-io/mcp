import { useState, useEffect, useCallback, useRef } from "react";
import { client } from "../client";
import { errorMessage } from "../errorMessage";
import type { Case } from "../gen/ameliso/v1/types_pb";
import { Priority } from "../gen/ameliso/v1/types_pb";
import MarkdownBody from "./MarkdownBody";

interface Props {
  repoId: string;
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

function priorityColor(p: string): string {
  switch (p) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f97316";
    case "low":
      return "#22c55e";
    default:
      return "#94a3b8";
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

export default function CasesTab({ repoId }: Props) {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority>(Priority.UNSPECIFIED);
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState<"path" | "priority">("priority");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [saving, setSaving] = useState(false);

  async function fetchBody(casePath: string): Promise<string> {
    const res = await client.getCase({ repoId, casePath });
    return res.body;
  }

  async function toggleExpand(casePath: string) {
    if (expandedPath === casePath) {
      setExpandedPath(null);
      setExpandedBody("");
      return;
    }
    setExpandedPath(casePath);
    setExpandedBody("");
    setBodyLoading(true);
    try {
      setExpandedBody(await fetchBody(casePath));
    } catch (e) {
      setError(errorMessage(e));
      setExpandedPath(null);
    } finally {
      setBodyLoading(false);
    }
  }

  async function startEdit(c: Case) {
    setEditingPath(c.path);
    setEditTitle(c.title);
    setEditDesc(c.description);
    setEditPriority(stringToPriority(c.priority));
    setEditTags(c.tags.join(", "));
    setEditBody("");
    try {
      setEditBody(await fetchBody(c.path));
    } catch {
      // body stays empty; server will preserve existing body on update
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.listCases({
        repoId,
        query: debouncedSearch,
        priority: priorityFilter,
        tags: tagFilter ? [tagFilter] : [],
      });
      setCases(res.cases);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [repoId, debouncedSearch, priorityFilter, tagFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
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
      setNewPath("");
      setNewTitle("");
      setNewDesc("");
      setNewTags("");
      setNewBody("");
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(casePath: string) {
    if (!confirm(`Delete case "${casePath}"?`)) return;
    try {
      await client.deleteCase({ repoId, casePath });
      if (expandedPath === casePath) setExpandedPath(null);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
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
      });
      setEditingPath(null);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!repoId) {
    return (
      <div style={{ color: "#64748b", padding: "40px", textAlign: "center" }}>
        Set a repository path in the Overview tab first.
      </div>
    );
  }

  const allTags = Array.from(new Set(cases.flatMap((c) => c.tags)));

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "700" }}>Cases</h2>
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
          {showCreate ? "Cancel" : "+ New Case"}
        </button>
      </div>

      {showCreate && (
        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Create Case</h3>
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
                Path (e.g. auth/login)
              </label>
              <input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
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
                Title
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Description
              </label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
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
                Priority
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(Number(e.target.value) as Priority)}
                style={inputStyle}
              >
                <option value={Priority.LOW}>Low</option>
                <option value={Priority.MEDIUM}>Medium</option>
                <option value={Priority.HIGH}>High</option>
              </select>
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
                Tags (comma-separated)
              </label>
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Steps / Body (Markdown)
              </label>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder={"## Steps\n\n1. \n\n## Expected Result\n\n"}
                rows={6}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  fontFamily: "monospace",
                  fontSize: "13px",
                }}
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
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        style={{ ...card, display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}
      >
        <input
          type="text"
          placeholder="Search cases…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: "200px" }}
        />
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(Number(e.target.value) as Priority)}
          style={{ ...inputStyle, width: "auto" }}
        >
          <option value={Priority.UNSPECIFIED}>All priorities</option>
          <option value={Priority.LOW}>Low</option>
          <option value={Priority.MEDIUM}>Medium</option>
          <option value={Priority.HIGH}>High</option>
        </select>
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto" }}
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "path" | "priority")}
          style={{ ...inputStyle, width: "auto" }}
        >
          <option value="priority">Sort: Priority</option>
          <option value="path">Sort: Path</option>
        </select>
        {!loading && cases.length > 0 && (
          <span style={{ fontSize: "13px", color: "#94a3b8", whiteSpace: "nowrap" }}>
            {cases.length} case{cases.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

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

      {!loading && cases.length === 0 && !error && (
        <div style={{ ...card, color: "#64748b", textAlign: "center", padding: "40px" }}>
          No cases found.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[...cases]
          .sort((a, b) => {
            if (sortBy === "priority") {
              const ord = { high: 0, medium: 1, low: 2 } as Record<string, number>;
              const diff = (ord[a.priority] ?? 3) - (ord[b.priority] ?? 3);
              return diff !== 0 ? diff : a.path.localeCompare(b.path);
            }
            return a.path.localeCompare(b.path);
          })
          .map((c) => (
            <div key={c.path}>
              <div
                style={{
                  ...card,
                  marginBottom: 0,
                  borderBottomLeftRadius:
                    expandedPath === c.path || editingPath === c.path ? 0 : "8px",
                  borderBottomRightRadius:
                    expandedPath === c.path || editingPath === c.path ? 0 : "8px",
                }}
              >
                {editingPath === c.path ? (
                  <form
                    onSubmit={handleUpdate}
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          display: "block",
                          marginBottom: "3px",
                        }}
                      >
                        Title
                      </label>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        required
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          display: "block",
                          marginBottom: "3px",
                        }}
                      >
                        Priority
                      </label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(Number(e.target.value) as Priority)}
                        style={inputStyle}
                      >
                        <option value={Priority.LOW}>Low</option>
                        <option value={Priority.MEDIUM}>Medium</option>
                        <option value={Priority.HIGH}>High</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          display: "block",
                          marginBottom: "3px",
                        }}
                      >
                        Description
                      </label>
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          display: "block",
                          marginBottom: "3px",
                        }}
                      >
                        Tags (comma-separated)
                      </label>
                      <input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          display: "block",
                          marginBottom: "3px",
                        }}
                      >
                        Steps / Body (Markdown)
                      </label>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={8}
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                          fontFamily: "monospace",
                          fontSize: "13px",
                        }}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          padding: "6px 16px",
                          background: "#16a34a",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPath(null)}
                        style={{
                          padding: "6px 16px",
                          background: "none",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleExpand(c.path)}
                  >
                    <div
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: priorityColor(c.priority),
                        marginTop: "6px",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{ fontSize: "13px", color: "#94a3b8", fontFamily: "monospace" }}
                        >
                          {c.path}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: priorityColor(c.priority),
                            fontWeight: "600",
                          }}
                        >
                          {priorityLabel(c.priority)}
                        </span>
                        {c.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: "11px",
                              background: "#f1f5f9",
                              color: "#64748b",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <p style={{ margin: "4px 0 0", fontWeight: "600", fontSize: "15px" }}>
                        {c.title}
                      </p>
                      {c.description && (
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                          {c.description}
                        </p>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#94a3b8",
                        flexShrink: 0,
                        marginTop: "2px",
                      }}
                    >
                      {expandedPath === c.path ? "▲" : "▼"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(c);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid #e2e8f0",
                        color: "#334155",
                        borderRadius: "4px",
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: "12px",
                        flexShrink: 0,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c.path);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid #fecaca",
                        color: "#ef4444",
                        borderRadius: "4px",
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: "12px",
                        flexShrink: 0,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {expandedPath === c.path && editingPath !== c.path && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderTop: "none",
                    borderBottomLeftRadius: "8px",
                    borderBottomRightRadius: "8px",
                    padding: "16px 20px",
                  }}
                >
                  {bodyLoading ? (
                    <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>Loading…</p>
                  ) : expandedBody ? (
                    <MarkdownBody body={expandedBody} />
                  ) : (
                    <p
                      style={{ color: "#94a3b8", fontSize: "14px", margin: 0, fontStyle: "italic" }}
                    >
                      No body.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
