import { pageMetadata } from "@/lib/metadata";
import CasesPageClient from "./client";

export const metadata = pageMetadata(
  "Cases",
  "Browse, search, and manage test cases for your repository"
);

export default function CasesPage() {
  return <CasesPageClient />;
}
