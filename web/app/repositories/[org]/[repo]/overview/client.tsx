"use client";

import OverviewTab from "@/components/OverviewTab";

interface Props {
  repoId: string;
  basePath: string;
}

export default function OverviewPageClient({ repoId, basePath }: Props) {
  return <OverviewTab repoId={repoId} basePath={basePath} />;
}
