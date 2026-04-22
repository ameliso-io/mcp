import OverviewTab from "@/components/OverviewTab";
import { pageMetadata } from "@/lib/metadata";

interface Props {
  params: Promise<{ org: string; repo: string }>;
}

export function generateMetadata() {
  return pageMetadata(
    "Overview",
    "Test coverage summary, active runs, and affected cases for your repository"
  );
}

export default async function OverviewPage({ params }: Props) {
  const { org, repo } = await params;
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return <OverviewTab repoId={repoId} basePath={basePath} />;
}
