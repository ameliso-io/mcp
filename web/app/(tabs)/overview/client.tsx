"use client";

import OverviewTab from "@/components/OverviewTab";
import { useRepoId } from "@/hooks/useRepoId";

export default function OverviewPageClient() {
  const [repoId] = useRepoId();
  return <OverviewTab repoId={repoId} />;
}
