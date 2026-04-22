import RunsPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props {
  params: Promise<{ org: string; repo: string }>;
}

export function generateMetadata() {
  return pageMetadata("Runs", "View and manage test runs, record results, and track progress");
}

export default async function RunsPage({ params }: Props) {
  const { org, repo } = await params;
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return <RunsPageClient repoId={repoId} basePath={basePath} />;
}
