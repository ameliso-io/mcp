"use client";

import { useCallback, Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RepositoriesTab from "@/components/RepositoriesTab";
import { useRepoId } from "@/hooks/useRepoId";
import LoadingSpinner from "@/components/LoadingSpinner";

function RepositoriesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repoId, setRepoId] = useRepoId();
  const [, startTransition] = useTransition();

  const installationId = searchParams.get("installation_id") ?? undefined;
  const setupAction = searchParams.get("setup_action") ?? undefined;

  const handleRepoSelect = useCallback(
    (id: string) => {
      setRepoId(id);
      if (id) router.push("/overview");
    },
    [setRepoId, router]
  );

  const handleInstallationHandled = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("installation_id");
    params.delete("setup_action");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/repositories?${qs}` : "/repositories", { scroll: false });
    });
  }, [router, searchParams, startTransition]);

  return (
    <RepositoriesTab
      activeRepoId={repoId}
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
