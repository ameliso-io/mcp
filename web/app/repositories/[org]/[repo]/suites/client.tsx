"use client";

import type { Route } from "next";
import { useCallback, Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SuitesTab from "@/components/SuitesTab";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRepoParams } from "@/hooks/useRepoParams";

function SuitesInner() {
  const { repoId, basePath } = useRepoParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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
      startTransition(() => {
        router.replace((qs ? `${basePath}/suites?${qs}` : `${basePath}/suites`) as Route);
      });
    },
    [router, searchParams, basePath]
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
