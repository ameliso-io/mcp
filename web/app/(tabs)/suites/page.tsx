import type { Metadata } from "next";
import SuitesPageClient from "./client";

export const metadata: Metadata = {
  title: "Suites",
  description: "Organize test cases into suites and run them as a group",
};

export default function SuitesPage() {
  return <SuitesPageClient />;
}
