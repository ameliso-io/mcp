import SuitesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props { params: Promise<{ org: string; repo: string }> };

export async function generateMetadata({ params }: Props) {
  const { org, repo } = await params;
  return pageMetadata(
    `${org}/${repo} · Suites`,
    "Organize test cases into suites and run them as a group"
  );
}

export default function SuitesPage() {
  return <SuitesPageClient />;
}
