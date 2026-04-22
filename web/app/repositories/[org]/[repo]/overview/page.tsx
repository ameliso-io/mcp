import OverviewPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props { params: Promise<{ org: string; repo: string }> };

export async function generateMetadata({ params }: Props) {
  const { org, repo } = await params;
  return pageMetadata(
    `${org}/${repo} · Overview`,
    "Test coverage summary, active runs, and affected cases for your repository"
  );
}

export default function OverviewPage() {
  return <OverviewPageClient />;
}
