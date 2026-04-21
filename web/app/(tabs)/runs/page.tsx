import type { Metadata } from "next";
import RunsPageClient from "./client";

export const metadata: Metadata = {
  title: "Runs",
  description: "View and manage test runs, record results, and track progress",
};

export default function RunsPage() {
  return <RunsPageClient />;
}
