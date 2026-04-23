"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, Suspense, useTransition } from "react";
import RunsTab from "@/components/RunsTab";
import LoadingSpinner from "@/components/LoadingSpinner";
import { RunStatus, ResultStatus } from "@/gen/ameliso/v1/types_pb";
import { useRepoParams } from "@/hooks/useRepoParams";

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

const RESULT_SLUG: Record<string, ResultStatus> = {
  passed: ResultStatus.PASSED,
  failed: ResultStatus.FAILED,
  blocked: ResultStatus.BLOCKED,
  skipped: ResultStatus.SKIPPED,
};

const SLUG_BY_RESULT: Record<number, string> = {
  [ResultStatus.PASSED]: "passed",
  [ResultStatus.FAILED]: "failed",
  [ResultStatus.BLOCKED]: "blocked",
  [ResultStatus.SKIPPED]: "skipped",
};

function RunsInner() {
  const { repoId, basePath } = useRepoParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const initialSuite = searchParams.get("suite") ?? undefined;
  const initialStatusFilter =
    STATUS_SLUG[searchParams.get("status") ?? ""] ?? RunStatus.UNSPECIFIED;
  const initialSelectedRunId = searchParams.get("run") ?? undefined;
  const initialResultStatusFilter = RESULT_SLUG[searchParams.get("result") ?? ""] ?? null;

  const handleInitialSuiteConsumed = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("suite");
    const qs = params.toString();
    startTransition(() => {
      router.replace((qs ? `${basePath}/runs?${qs}` : `${basePath}/runs`) as Route);
    });
  }, [router, searchParams, basePath]);

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
        router.replace((qs ? `${basePath}/runs?${qs}` : `${basePath}/runs`) as Route);
      });
    },
    [router, searchParams, basePath]
  );

  const handleSelectedRunIdChange = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) {
        params.set("run", id);
      } else {
        params.delete("run");
      }
      params.delete("result");
      const qs = params.toString();
      startTransition(() => {
        router.replace((qs ? `${basePath}/runs?${qs}` : `${basePath}/runs`) as Route);
      });
    },
    [router, searchParams, basePath]
  );

  const handleResultStatusFilterChange = useCallback(
    (s: ResultStatus | null) => {
      const params = new URLSearchParams(searchParams.toString());
      const slug = s !== null ? SLUG_BY_RESULT[s] : undefined;
      if (slug) {
        params.set("result", slug);
      } else {
        params.delete("result");
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace((qs ? `${basePath}/runs?${qs}` : `${basePath}/runs`) as Route);
      });
    },
    [router, searchParams, basePath]
  );

  return (
    <RunsTab
      repoId={repoId}
      initialSuite={initialSuite}
      onInitialSuiteConsumed={handleInitialSuiteConsumed}
      initialStatusFilter={initialStatusFilter}
      onStatusFilterChange={handleStatusFilterChange}
      initialSelectedRunId={initialSelectedRunId}
      onSelectedRunIdChange={handleSelectedRunIdChange}
      initialResultStatusFilter={initialResultStatusFilter}
      onResultStatusFilterChange={handleResultStatusFilterChange}
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
