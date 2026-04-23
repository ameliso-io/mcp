import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Case } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setCases: Dispatch<SetStateAction<Case[]>>;
  setError: (msg: string | null) => void;
  expandedPath: string | null;
  setExpandedPath: Dispatch<SetStateAction<string | null>>;
  announceAction: (msg: string) => void;
}

export function useCaseDelete({
  repoId,
  setCases,
  setError,
  expandedPath,
  setExpandedPath,
  announceAction,
}: Params) {
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(casePath: string) {
    setDeleting(true);
    try {
      await client.deleteCase({ repoId, casePath });
      setCases((prev) => prev.filter((c) => c.path !== casePath));
      if (expandedPath === casePath) setExpandedPath(null);
      setConfirmingDelete(null);
      announceAction("Case deleted");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return { confirmingDelete, setConfirmingDelete, deleting, handleDelete };
}
