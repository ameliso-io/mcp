"use client";

import type { Route } from "next";
import { useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RepositoriesTab from "@/components/RepositoriesTab";
import LoadingSpinner from "@/components/LoadingSpinner";

function RepositoriesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const installationId = searchParams.get("installation_id") ?? undefined;
  const setupAction = searchParams.get("setup_action") ?? undefined;

  const handleRepoSelect = useCallback(
    (id: string) => {
      const slashIdx = id.indexOf("/");
      const org = id.slice(0, slashIdx);
      const repo = id.slice(slashIdx + 1);
      router.push(`/repositories/${org}/${repo}/overview` as Route);
    },
    [router]
  );

  const handleInstallationHandled = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("installation_id");
    params.delete("setup_action");
    const qs = params.toString();
    router.replace(qs ? `/repositories?${qs}` : "/repositories", { scroll: false });
  }, [router, searchParams]);

  return (
    <RepositoriesTab
      activeRepoId=""
      onRepoSelect={handleRepoSelect}
      installationId={installationId}
      setupAction={setupAction}
      onInstallationHandled={handleInstallationHandled}
    />
  );
}

export default function RepositoriesPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <RepositoriesInner />
    </Suspense>
  );
}
