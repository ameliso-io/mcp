"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import OverviewTab from "@/components/OverviewTab";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";
import { useRepoParams } from "@/hooks/useRepoParams";
import { useRouteReplace } from "@/hooks/useRouteReplace";

const STATUS_SLUG: Record<string, ResultStatus> = {
  passed: ResultStatus.PASSED,
  failed: ResultStatus.FAILED,
  blocked: ResultStatus.BLOCKED,
  skipped: ResultStatus.SKIPPED,
  never: ResultStatus.NEVER,
};

const SLUG_BY_STATUS: Record<number, string> = {
  [ResultStatus.PASSED]: "passed",
  [ResultStatus.FAILED]: "failed",
  [ResultStatus.BLOCKED]: "blocked",
  [ResultStatus.SKIPPED]: "skipped",
  [ResultStatus.NEVER]: "never",
};

function OverviewInner() {
  const { repoId, basePath } = useRepoParams();
  const searchParams = useSearchParams();
  const replace = useRouteReplace(`${basePath}/overview`);

  const initialCoverageFilter =
    STATUS_SLUG[searchParams.get("status") ?? ""] ?? ResultStatus.UNSPECIFIED;

  const handleCoverageFilterChange = useCallback(
    (s: ResultStatus) => {
      replace((params) => {
        const slug = SLUG_BY_STATUS[s];
        if (slug) {
          params.set("status", slug);
        } else {
          params.delete("status");
        }
      });
    },
    [replace]
  );

  return (
    <OverviewTab
      repoId={repoId}
      basePath={basePath}
      initialCoverageFilter={initialCoverageFilter}
      onCoverageFilterChange={handleCoverageFilterChange}
    />
  );
}

export default function OverviewPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OverviewInner />
    </Suspense>
  );
}
