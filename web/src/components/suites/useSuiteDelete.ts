import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Suite } from "@/gen/ameliso/v1/types_pb";

interface Params {
  repoId: string;
  setSuites: Dispatch<SetStateAction<Suite[]>>;
  setError: (msg: string | null) => void;
  expanded: string | null;
  setExpanded: Dispatch<SetStateAction<string | null>>;
  announce: (msg: string) => void;
  load: () => Promise<void>;
}

export function useSuiteDelete({ repoId, setSuites, setError, expanded, setExpanded, announce, load }: Params) {
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(slug: string) {
    setDeleting(true);
    try {
      await client.deleteSuite({ repoId, slug });
      setSuites((prev) => prev.filter((s) => s.slug !== slug));
      if (expanded === slug) setExpanded(null);
      setConfirmingDelete(null);
      announce("Suite deleted");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return { confirmingDelete, setConfirmingDelete, deleting, handleDelete };
}
