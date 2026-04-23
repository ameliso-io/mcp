import NotFoundView from "@/components/NotFoundView";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("Not Found", "The page you requested could not be found");

export default function NotFound() {
  return <NotFoundView heading="404 — Page not found" backHref="/repositories" backLabel="Go to Repositories" />;
}
