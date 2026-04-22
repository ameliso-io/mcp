"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, Suspense, useTransition } from "react";
import RunsTab from "@/components/RunsTab";
import { useRepoId } from "@/hooks/useRepoId";
import LoadingSpinner from "@/components/LoadingSpinner";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

const STATUS_SLUG: Record<string, RunStatus> = {
  "in-progress": RunStatus.IN_PROGRESS,
  completed: RunStatus.COMPLETED,
  aborted: RunStatus.ABORTED,
};

const SLUG_BY_STATUS: Record<number, string> = {
  [RunStatus.IN_PROGRESS]: "in-progress",
  [RunStatus.COMPLETED]: "completed",
  [RunStatus.ABORTED]: "aborted",
};

function RunsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repoId] = useRepoId();
  const [, startTransition] = useTransition();
  const initialSuite = searchParams.get("suite") ?? undefined;
  const initialStatusFilter =
    STATUS_SLUG[searchParams.get("status") ?? ""] ?? RunStatus.UNSPECIFIED;

  const handleInitialSuiteConsumed = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("suite");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/runs?${qs}` : "/runs", { scroll: false });
    });
  }, [router, searchParams, startTransition]);

  const handleStatusFilterChange = useCallback(
    (s: RunStatus) => {
      const params = new URLSearchParams(searchParams.toString());
      const slug = SLUG_BY_STATUS[s];
      if (slug) {
        params.set("status", slug);
      } else {
        params.delete("status");
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/runs?${qs}` : "/runs", { scroll: false });
      });
    },
    [router, searchParams, startTransition]
  );

  return (
    <RunsTab
      repoId={repoId}
      initialSuite={initialSuite}
      onInitialSuiteConsumed={handleInitialSuiteConsumed}
      initialStatusFilter={initialStatusFilter}
      onStatusFilterChange={handleStatusFilterChange}
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
