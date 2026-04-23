"use client";

import { useCallback, Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RepositoriesTab from "@/components/RepositoriesTab";
import LoadingSpinner from "@/components/LoadingSpinner";

function RepositoriesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const installationId = searchParams.get("installation_id") ?? undefined;
  const setupAction = searchParams.get("setup_action") ?? undefined;
  const initialSearch = searchParams.get("q") ?? "";

  const handleSearchChange = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) {
        params.set("q", q);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/repositories?${qs}` : "/repositories");
      });
    },
    [router, searchParams]
  );

  const handleInstallationHandled = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("installation_id");
    params.delete("setup_action");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/repositories?${qs}` : "/repositories");
    });
  }, [router, searchParams]);

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
    <Suspense fallback={<LoadingSpinner />}>
      <RepositoriesInner />
    </Suspense>
  );
}
