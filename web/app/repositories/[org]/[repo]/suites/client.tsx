"use client";

import type { Route } from "next";
import { useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SuitesTab from "@/components/SuitesTab";
import { useRepoParams } from "@/hooks/useRepoParams";
import LoadingSpinner from "@/components/LoadingSpinner";

function SuitesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { repoId, basePath } = useRepoParams();

  const initialExpanded = searchParams.get("expanded") ?? undefined;

  const handleExpandedChange = useCallback(
    (slug: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (slug) {
        params.set("expanded", slug);
      } else {
        params.delete("expanded");
      }
      const qs = params.toString();
      router.replace((qs ? `${basePath}/suites?${qs}` : `${basePath}/suites`) as Route<string>);
    },
    [router, searchParams, basePath]
  );

  return (
    <SuitesTab
      repoId={repoId}
      initialExpanded={initialExpanded}
      onExpandedChange={handleExpandedChange}
    />
  );
}

export default function SuitesPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SuitesInner />
    </Suspense>
  );
}
