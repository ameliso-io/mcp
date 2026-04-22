import { pageMetadata } from "@/lib/metadata";
import SuitesPageClient from "./client";

export const metadata = pageMetadata(
  "Suites",
  "Organize test cases into suites and run them as a group"
);

export default function SuitesPage() {
  return <SuitesPageClient />;
}
