import RepositoriesPageClient from "./client";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Repositories",
  "Connect and manage GitHub repositories for test tracking"
);

export default function RepositoriesPage() {
  return <RepositoriesPageClient />;
}
