"use client";

import { useRouter } from "next/navigation";
import RepositoriesTab from "@/components/RepositoriesTab";
import { useRepoId } from "@/hooks/useRepoId";

export default function RepositoriesPageClient() {
  const router = useRouter();
  const [repoId, setRepoId] = useRepoId();

  function handleRepoSelect(id: string) {
    setRepoId(id);
    if (id) router.push("/overview");
  }

  return <RepositoriesTab activeRepoId={repoId} onRepoSelect={handleRepoSelect} />;
}
