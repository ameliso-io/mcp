export interface SuitesTabProps {
  repoId: string;
  basePath: string;
  initialExpanded?: string | undefined;
  onExpandedChange?: ((slug: string | null) => void) | undefined;
}
