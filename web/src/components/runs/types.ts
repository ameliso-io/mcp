import type { RunStatus } from "@/gen/ameliso/v1/types_pb";

export interface RunsTabProps {
  repoId: string;
  initialSuite?: string | undefined;
  onInitialSuiteConsumed?: () => void;
  initialStatusFilter?: RunStatus;
  onStatusFilterChange?: (s: RunStatus) => void;
}
