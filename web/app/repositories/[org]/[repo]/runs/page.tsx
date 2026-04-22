import RunsPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props { params: Promise<{ org: string; repo: string }> };

export async function generateMetadata({ params }: Props) {
  const { org, repo } = await params;
  return pageMetadata(
    `${org}/${repo} · Runs`,
    "View and manage test runs, record results, and track progress"
  );
}

export default function RunsPage() {
  return <RunsPageClient />;
}
