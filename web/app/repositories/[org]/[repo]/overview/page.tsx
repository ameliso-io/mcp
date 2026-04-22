import OverviewPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return pageMetadata(
    "Overview",
    "Test coverage summary, active runs, and affected cases for your repository"
  );
}

export default function OverviewPage() {
  return <OverviewPageClient />;
}
