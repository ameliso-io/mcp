import type { Metadata } from "next";
import RepositoriesPageClient from "./client";

export const metadata: Metadata = {
  title: "Repositories",
  description: "Connect and manage GitHub repositories for test tracking",
};

export default function RepositoriesPage() {
  return <RepositoriesPageClient />;
}
