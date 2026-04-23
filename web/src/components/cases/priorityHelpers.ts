import { Priority } from "@/gen/ameliso/v1/types_pb";

export function stringToPriority(p: string): Priority {
  switch (p) {
    case "high":
      return Priority.HIGH;
    case "medium":
      return Priority.MEDIUM;
    case "low":
      return Priority.LOW;
    default:
      return Priority.MEDIUM;
  }
}

export function priorityLabel(p: string): string {
  switch (p) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "—";
  }
}
