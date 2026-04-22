import CasesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

interface Props { params: Promise<{ org: string; repo: string }> };

export async function generateMetadata({ params }: Props) {
  const { org, repo } = await params;
  return pageMetadata(
    `${org}/${repo} · Cases`,
    "Browse, search, and manage test cases for your repository"
  );
}

export default function CasesPage() {
  return <CasesPageClient />;
}
