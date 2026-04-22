import SuitesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return pageMetadata("Suites", "Organize test cases into suites and run them as a group");
}

export default function SuitesPage() {
  return <SuitesPageClient />;
}
