import { useState } from "react";
import type { MutableRefObject } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Suite } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  load: () => Promise<void>;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
  announce: (msg: string) => void;
}

export function useSuiteEdit({ repoId, load, setError, lastFocusRef, announce }: Params) {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCases, setEditCases] = useState("");
  const [editNewSlug, setEditNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(suite: Suite) {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setEditingSlug(suite.slug);
    setEditName(suite.name);
    setEditDesc(suite.description);
    setEditCases(suite.cases.join(", "));
    setEditNewSlug("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — form only renders when editingSlug is set */
    if (!editingSlug) return;
    setSaving(true);
    try {
      await client.updateSuite({
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
      setEditingSlug(null);
      lastFocusRef.current?.focus();
      announce("Suite updated");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return {
    editingSlug,
    setEditingSlug,
    editName,
    setEditName,
    editDesc,
    setEditDesc,
    editCases,
    setEditCases,
    editNewSlug,
    setEditNewSlug,
    saving,
    startEdit,
    handleUpdate,
  };
}
