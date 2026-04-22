"use client";

import { Suspense } from "react";
import OverviewTab from "@/components/OverviewTab";
import { useRepoParams } from "@/hooks/useRepoParams";
import LoadingSpinner from "@/components/LoadingSpinner";

function OverviewInner() {
  const { repoId, basePath } = useRepoParams();
  return <OverviewTab repoId={repoId} basePath={basePath} />;
}

export default function OverviewPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OverviewInner />
    </Suspense>
  );
}
