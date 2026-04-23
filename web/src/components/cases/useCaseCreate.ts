import { useState } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case } from "@/gen/ameliso/v1/types_pb";
import { Priority } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setCases: Dispatch<SetStateAction<Case[]>>;
  setError: (msg: string | null) => void;
  lastFocusRef: MutableRefObject<HTMLElement | null>;
  announceAction: (msg: string) => void;
}

export function useCaseCreate({ repoId, setCases, setError, lastFocusRef, announceAction }: Params) {
  const [showCreate, setShowCreate] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);
  const [newTags, setNewTags] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    /* v8 ignore next 2 — required fields prevent submission when blank */
    if (!repoId || !newPath || !newTitle) return;
    setCreating(true);
    try {
      const created = await client.createCase({
        repoId, casePath: newPath, title: newTitle, description: newDesc, priority: newPriority,
        tags: newTags ? newTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        body: newBody,
      });
      setShowCreate(false);
      lastFocusRef.current?.focus();
      setNewPath(""); setNewTitle(""); setNewDesc(""); setNewTags(""); setNewBody("");
      setNewPriority(Priority.MEDIUM);
      announceAction("Case created");
      const newCase = created.case;
      if (newCase) setCases((prev) => [...prev, newCase]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return { showCreate, setShowCreate, newPath, setNewPath, newTitle, setNewTitle, newDesc, setNewDesc, newPriority, setNewPriority, newTags, setNewTags, newBody, setNewBody, creating, handleCreate };
}
