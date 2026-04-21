"use client";

import { useRouter } from "next/navigation";
import OverviewTab from "@/components/OverviewTab";
import { useRepoId } from "@/hooks/useRepoId";

export default function OverviewPageClient() {
  const router = useRouter();
  const [repoId] = useRepoId();

  return <OverviewTab repoId={repoId} onGoToRuns={() => router.push("/runs")} />;
}
