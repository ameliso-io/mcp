"use client";

import { useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SuitesTab from "@/components/SuitesTab";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRepoParams } from "@/hooks/useRepoParams";
import { useRouteReplace } from "@/hooks/useRouteReplace";

function SuitesInner() {
  const { repoId, basePath } = useRepoParams();
  const searchParams = useSearchParams();
  const replace = useRouteReplace(`${basePath}/suites`);

  const initialExpanded = searchParams.get("expanded") ?? undefined;

  const handleExpandedChange = useCallback(
    (slug: string | null) => {
      replace((params) => {
        if (slug) {
          params.set("expanded", slug);
        } else {
          params.delete("expanded");
        }
      });
    },
    [replace]
  );

  return (
    <SuitesTab
      repoId={repoId}
      basePath={basePath}
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
