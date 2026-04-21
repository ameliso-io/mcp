"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import RunsTab from "@/components/RunsTab";
import { useRepoId } from "@/hooks/useRepoId";
import LoadingSpinner from "@/components/LoadingSpinner";

function RunsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repoId] = useRepoId();
  const initialSuite = searchParams.get("suite") ?? undefined;

  function handleInitialSuiteConsumed() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("suite");
    const qs = params.toString();
    router.replace(qs ? `/runs?${qs}` : "/runs");
  }

  return (
    <RunsTab
      repoId={repoId}
      initialSuite={initialSuite}
      onInitialSuiteConsumed={handleInitialSuiteConsumed}
    />
  );
}

export default function RunsPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <RunsInner />
    </Suspense>
  );
}
