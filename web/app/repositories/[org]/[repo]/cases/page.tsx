import CasesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return pageMetadata("Cases", "Browse, search, and manage test cases for your repository");
}

export default function CasesPage() {
  return <CasesPageClient />;
}
