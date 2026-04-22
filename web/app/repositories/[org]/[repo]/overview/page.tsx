import { pageMetadata } from "@/lib/metadata";
import OverviewPageClient from "./client";

export const metadata = pageMetadata(
  "Overview",
  "Test coverage summary, active runs, and affected cases for your repository"
);

export default function OverviewPage() {
  return <OverviewPageClient />;
}
