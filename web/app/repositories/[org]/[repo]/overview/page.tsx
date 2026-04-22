import OverviewPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props {
  params: Promise<{ org: string; repo: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { org, repo } = await params;
  return pageMetadata(
    `${org}/${repo} · Overview`,
    "Test coverage summary, active runs, and affected cases for your repository"
  );
}

export default async function OverviewPage({ params }: Props) {
  const { org, repo } = await params;
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return <OverviewPageClient repoId={repoId} basePath={basePath} />;
}
