import { pageMetadata } from "@/lib/metadata";
import RunsPageClient from "./client";

export const metadata = pageMetadata(
  "Runs",
  "View and manage test runs, record results, and track progress"
);

export default function RunsPage() {
  return <RunsPageClient />;
}
