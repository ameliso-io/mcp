import type { Metadata } from "next";
import CasesPageClient from "./client";

export const metadata: Metadata = {
  title: "Cases",
  description: "Browse, search, and manage test cases for your repository",
};

export default function CasesPage() {
  return <CasesPageClient />;
}
