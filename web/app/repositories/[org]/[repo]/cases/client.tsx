"use client";

import { useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LoadingSkeleton from "./loading";
import CasesTab from "@/components/CasesTab";
import { Priority } from "@/gen/ameliso/v1/types_pb";
import { useRepoParams } from "@/hooks/useRepoParams";
import { useRouteReplace } from "@/hooks/useRouteReplace";

const PRIORITY_SLUG: Record<string, Priority> = {
  low: Priority.LOW,
  medium: Priority.MEDIUM,
  high: Priority.HIGH,
};

const SLUG_BY_PRIORITY: Record<number, string> = {
  [Priority.LOW]: "low",
  [Priority.MEDIUM]: "medium",
  [Priority.HIGH]: "high",
};

function CasesInner() {
  const { repoId, basePath } = useRepoParams();
  const searchParams = useSearchParams();
  const replace = useRouteReplace(`${basePath}/cases`);

  const initialSearch = searchParams.get("q") ?? "";
  const initialPriorityFilter =
    PRIORITY_SLUG[searchParams.get("priority") ?? ""] ?? Priority.UNSPECIFIED;
  const initialTagFilter = searchParams.get("tag") ?? "";
  const initialSuiteFilter = searchParams.get("suite") ?? "";
  const rawSort = searchParams.get("sort");
  const initialSortBy: "path" | "priority" = rawSort === "path" ? "path" : "priority";
  const initialExpandedPath = searchParams.get("case") ?? undefined;

  const handleFiltersChange = useCallback(
    (filters: {
      search: string;
      priority: Priority;
      tag: string;
      suite: string;
      sort: "path" | "priority";
    }) => {
      replace((params) => {
        if (filters.search) {
          params.set("q", filters.search);
        } else {
          params.delete("q");
        }
        const prioritySlug = SLUG_BY_PRIORITY[filters.priority];
        if (prioritySlug) {
          params.set("priority", prioritySlug);
        } else {
          params.delete("priority");
        }
        if (filters.tag) {
          params.set("tag", filters.tag);
        } else {
          params.delete("tag");
        }
        if (filters.suite) {
          params.set("suite", filters.suite);
        } else {
          params.delete("suite");
        }
        if (filters.sort !== "priority") {
          params.set("sort", filters.sort);
        } else {
          params.delete("sort");
        }
      });
    },
    [replace]
  );

  const handleExpandedPathChange = useCallback(
    (path: string | null) => {
      replace((params) => {
        if (path) {
          params.set("case", path);
        } else {
          params.delete("case");
        }
      });
    },
    [replace]
  );

  return (
    <CasesTab
      repoId={repoId}
      initialSearch={initialSearch}
      initialPriorityFilter={initialPriorityFilter}
      initialTagFilter={initialTagFilter}
      initialSuiteFilter={initialSuiteFilter}
      initialSortBy={initialSortBy}
      onFiltersChange={handleFiltersChange}
      initialExpandedPath={initialExpandedPath}
      onExpandedPathChange={handleExpandedPathChange}
    />
  );
}

export default function CasesPageClient() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <CasesInner />
    </Suspense>
  );
}
