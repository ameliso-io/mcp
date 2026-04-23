"use client";

import type { Route } from "next";
import { useCallback, Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CasesTab from "@/components/CasesTab";
import { useRepoParams } from "@/hooks/useRepoParams";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Priority } from "@/gen/ameliso/v1/types_pb";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { repoId, basePath } = useRepoParams();
  const [, startTransition] = useTransition();

  const initialSearch = searchParams.get("q") ?? "";
  const initialPriorityFilter =
    PRIORITY_SLUG[searchParams.get("priority") ?? ""] ?? Priority.UNSPECIFIED;
  const initialTagFilter = searchParams.get("tag") ?? "";
  const rawSort = searchParams.get("sort");
  const initialSortBy: "path" | "priority" = rawSort === "path" ? "path" : "priority";

  const handleFiltersChange = useCallback(
    (filters: { search: string; priority: Priority; tag: string; sort: "path" | "priority" }) => {
      const params = new URLSearchParams(searchParams.toString());
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
      if (filters.sort !== "priority") {
        params.set("sort", filters.sort);
      } else {
        params.delete("sort");
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace((qs ? `${basePath}/cases?${qs}` : `${basePath}/cases`), {
          scroll: false,
        });
      });
    },
    [router, searchParams, basePath, startTransition]
  );

  return (
    <CasesTab
      repoId={repoId}
      initialSearch={initialSearch}
      initialPriorityFilter={initialPriorityFilter}
      initialTagFilter={initialTagFilter}
      initialSortBy={initialSortBy}
      onFiltersChange={handleFiltersChange}
    />
  );
}

export default function CasesPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CasesInner />
    </Suspense>
  );
}
