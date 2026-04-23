import { useState } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { stringToPriority } from "./priorityHelpers";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case } from "@/gen/ameliso/v1/types_pb";
import { Priority } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setCases: Dispatch<SetStateAction<Case[]>>;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
  editingBodyRef: MutableRefObject<string | null>;
  editingPath: string | null;
  setEditingPath: Dispatch<SetStateAction<string | null>>;
  announceAction: (msg: string) => void;
}

export function useCaseEdit({
  repoId,
  setCases,
  setError,
  lastFocusRef,
  editingBodyRef,
  editingPath,
  setEditingPath,
  announceAction,
}: Params) {
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>(Priority.MEDIUM);
  const [editTags, setEditTags] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editNewPath, setEditNewPath] = useState("");
  const [saving, setSaving] = useState(false);

  async function startEdit(c: Case) {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setEditingPath(c.path);
    setEditTitle(c.title);
    setEditDesc(c.description);
    setEditPriority(stringToPriority(c.priority));
    setEditTags(c.tags.join(", "));
    setEditBody("");
    setEditNewPath("");
    editingBodyRef.current = c.path;
    try {
      const res = await client.getCase({ repoId, casePath: c.path });
      /* v8 ignore next 1 — race guard, covered by stale startEdit test */
      if (editingBodyRef.current === c.path) setEditBody(res.body);
    } catch {
      // body stays empty; server preserves existing body on update
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — form only renders when editingPath is set */
    if (!editingPath) return;
    setSaving(true);
    try {
      const updated = await client.updateCase({
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
      if (updated.case) {
        const u = updated.case;
        setCases((prev) => prev.map((c) => (c.path === editingPath ? u : c)));
      }
      setEditingPath(null);
      lastFocusRef.current?.focus();
      announceAction("Case updated");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return {
    editTitle,
    setEditTitle,
    editDesc,
    setEditDesc,
    editPriority,
    setEditPriority,
    editTags,
    setEditTags,
    editBody,
    setEditBody,
    editNewPath,
    setEditNewPath,
    saving,
    startEdit,
    handleUpdate,
  };
}
