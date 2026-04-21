"use client";

import { Suspense } from "react";
import OverviewTab from "@/components/OverviewTab";
import { useRepoId } from "@/hooks/useRepoId";
import LoadingSpinner from "@/components/LoadingSpinner";

function OverviewInner() {
  const [repoId] = useRepoId();
  return <OverviewTab repoId={repoId} />;
}

export default function OverviewPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OverviewInner />
    </Suspense>
  );
}
