"use client";

import CasesTab from "@/components/CasesTab";
import { useRepoId } from "@/hooks/useRepoId";

export default function CasesPageClient() {
  const [repoId] = useRepoId();
  return <CasesTab repoId={repoId} />;
}
