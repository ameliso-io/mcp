"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import OverviewTab from "@/components/OverviewTab";
import LoadingSpinner from "@/components/LoadingSpinner";

function OverviewInner() {
  const { org, repo } = useParams<{ org: string; repo: string }>();
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return <OverviewTab repoId={repoId} basePath={basePath} />;
}

export default function OverviewPageClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OverviewInner />
    </Suspense>
  );
}
