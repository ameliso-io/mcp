"use client";

import { useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LoadingSkeleton from "./loading";
import RepositoriesTab from "@/components/RepositoriesTab";
import { useRouteReplace } from "@/hooks/useRouteReplace";

function RepositoriesInner() {
  const searchParams = useSearchParams();
  const replace = useRouteReplace("/repositories");

  const installationId = searchParams.get("installation_id") ?? undefined;
  const setupAction = searchParams.get("setup_action") ?? undefined;
  const initialSearch = searchParams.get("q") ?? "";

  const handleSearchChange = useCallback(
    (q: string) => {
      replace((params) => {
        if (q) {
          params.set("q", q);
        } else {
          params.delete("q");
        }
      });
    },
    [replace]
  );

  const handleInstallationHandled = useCallback(() => {
    replace((params) => {
      params.delete("installation_id");
      params.delete("setup_action");
    });
  }, [replace]);

  return (
    <RepositoriesTab
      installationId={installationId}
      setupAction={setupAction}
      onInstallationHandled={handleInstallationHandled}
      initialSearch={initialSearch}
      onSearchChange={handleSearchChange}
    />
  );
}

export default function RepositoriesPageClient() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <RepositoriesInner />
    </Suspense>
  );
}
