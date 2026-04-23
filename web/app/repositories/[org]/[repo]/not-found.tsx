import NotFoundView from "@/components/NotFoundView";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Not Found", "This repository could not be found");

export default function RepoNotFound() {
  return (
    <NotFoundView
      heading="404 — Repository not found"
      backHref="/repositories"
      backLabel="Back to Repositories"
    />
  );
}
