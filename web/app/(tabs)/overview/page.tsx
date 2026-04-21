import type { Metadata } from "next";
import OverviewPageClient from "./client";

export const metadata: Metadata = {
  title: "Overview",
  description: "Test coverage summary, active runs, and affected cases for your repository",
};

export default function OverviewPage() {
  return <OverviewPageClient />;
}
