"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import RunsTab from "@/components/RunsTab";
import { useRepoId } from "@/hooks/useRepoId";
import styles from "../app.module.css";

function RunsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repoId] = useRepoId();
  const initialSuite = searchParams.get("suite") ?? undefined;

  function handleInitialSuiteConsumed() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("suite");
    router.replace(`/runs?${params.toString()}`);
  }

  return (
    <RunsTab
      repoId={repoId}
      initialSuite={initialSuite}
      onInitialSuiteConsumed={handleInitialSuiteConsumed}
    />
  );
}

export default function RunsPageClient() {
  return (
    <Suspense fallback={<div className={styles.centered}><div className={styles.spinner} /></div>}>
      <RunsInner />
    </Suspense>
  );
}
