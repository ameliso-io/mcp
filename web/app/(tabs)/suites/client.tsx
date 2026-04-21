"use client";

import { useRouter } from "next/navigation";
import SuitesTab from "@/components/SuitesTab";
import { useRepoId } from "@/hooks/useRepoId";

export default function SuitesPageClient() {
  const router = useRouter();
  const [repoId] = useRepoId();

  return (
    <SuitesTab
      repoId={repoId}
      onRunSuite={(slug) => router.push(`/runs?suite=${encodeURIComponent(slug)}`)}
    />
  );
}
