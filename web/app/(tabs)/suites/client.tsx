"use client";

import { useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SuitesTab from "@/components/SuitesTab";
import { useRepoId } from "@/hooks/useRepoId";
import LoadingSpinner from "@/components/LoadingSpinner";

function SuitesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repoId] = useRepoId();

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
      router.replace(qs ? `/suites?${qs}` : "/suites");
    },
    [router, searchParams]
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
