import CasesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props {
  params: Promise<{ org: string; repo: string }>;
}

export function generateMetadata() {
  return pageMetadata("Cases", "Browse, search, and manage test cases for your repository");
}

export default async function CasesPage({ params }: Props) {
  const { org, repo } = await params;
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return <CasesPageClient repoId={repoId} basePath={basePath} />;
}
