import { useState } from "react";
import type { MutableRefObject } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";

interface Params {
  repoId: string;
  load: () => Promise<void>;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
  announce: (msg: string) => void;
}

export function useSuiteCreate({ repoId, load, setError, lastFocusRef, announce }: Params) {
  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCases, setNewCases] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — required fields prevent submission when blank */
    if (!repoId || !newSlug || !newName) return;
    setCreating(true);
    try {
      await client.createSuite({
        repoId, slug: newSlug, name: newName, description: newDesc,
        cases: newCases ? newCases.split(",").map((c) => c.trim()).filter(Boolean) : [],
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setNewSlug(""); setNewName(""); setNewDesc(""); setNewCases("");
      announce("Suite created");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return { showCreate, setShowCreate, newSlug, setNewSlug, newName, setNewName, newDesc, setNewDesc, newCases, setNewCases, creating, handleCreate };
}
