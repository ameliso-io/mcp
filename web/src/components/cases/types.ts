import type { Priority } from "@/gen/ameliso/v1/types_pb";

export interface FilterState {
  search: string;
  priority: Priority;
  tag: string;
  sort: "path" | "priority";
}

export interface CasesTabProps {
  repoId: string;
  initialSearch?: string | undefined;
  initialPriorityFilter?: Priority | undefined;
  initialTagFilter?: string | undefined;
  initialSortBy?: "path" | "priority" | undefined;
  onFiltersChange?: ((filters: FilterState) => void) | undefined;
}
