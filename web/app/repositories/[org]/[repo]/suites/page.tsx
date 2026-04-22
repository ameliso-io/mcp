import SuitesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props {
  params: Promise<{ org: string; repo: string }>;
}

export function generateMetadata() {
  return pageMetadata("Suites", "Organize test cases into suites and run them as a group");
}

export default async function SuitesPage({ params }: Props) {
  const { org, repo } = await params;
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return <SuitesPageClient repoId={repoId} basePath={basePath} />;
}
