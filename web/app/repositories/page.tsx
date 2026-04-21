import type { Metadata } from "next";
import RepositoriesPageClient from "./client";

export const metadata: Metadata = {
  title: "Repositories | Ameliso",
};

export default function RepositoriesPage() {
  return <RepositoriesPageClient />;
}
