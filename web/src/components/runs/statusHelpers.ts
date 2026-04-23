import { ResultStatus, RunStatus } from "@/gen/ameliso/v1/types_pb";

export function statusLabel(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED:
      return "Passed";
    case ResultStatus.FAILED:
      return "Failed";
    case ResultStatus.BLOCKED:
      return "Blocked";
    case ResultStatus.SKIPPED:
      return "Skipped";
    default:
      return "Unknown";
  }
}

export function runStatusLabel(s: RunStatus): string {
  switch (s) {
    case RunStatus.IN_PROGRESS:
      return "In Progress";
    case RunStatus.COMPLETED:
      return "Completed";
    case RunStatus.ABORTED:
      return "Aborted";
    default:
      return "Unknown";
  }
}
