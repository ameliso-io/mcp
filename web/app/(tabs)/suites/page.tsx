import type { Metadata } from "next";
import SuitesPageClient from "./client";

export const metadata: Metadata = {
  title: "Suites",
};

export default function SuitesPage() {
  return <SuitesPageClient />;
}
