import { pageMetadata } from "@/lib/metadata";
import RepositoriesPageClient from "./client";

export const metadata = pageMetadata(
  "Repositories",
  "Connect and manage GitHub repositories for test tracking"
);

export default function RepositoriesPage() {
  return <RepositoriesPageClient />;
}
