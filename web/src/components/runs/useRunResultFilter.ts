import { useMemo, useDeferredValue } from "react";
import type { CaseResult } from "@/gen/ameliso/v1/types_pb";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";

export function useRunResultFilter(
  recordedResults: CaseResult[],
  resultStatusFilter: ResultStatus | null
) {
  const resultCounts = useMemo(
    () => ({
      passed: recordedResults.filter((r) => r.status === ResultStatus.PASSED).length,
      failed: recordedResults.filter((r) => r.status === ResultStatus.FAILED).length,
      blocked: recordedResults.filter((r) => r.status === ResultStatus.BLOCKED).length,
      skipped: recordedResults.filter((r) => r.status === ResultStatus.SKIPPED).length,
    }),
    [recordedResults]
  );
  const filteredResults = useMemo(
    () =>
      resultStatusFilter !== null
        ? recordedResults.filter((r) => r.status === resultStatusFilter)
        : recordedResults,
    [recordedResults, resultStatusFilter]
  );
  const deferredFilteredResults = useDeferredValue(filteredResults);
  const isResultsStale = filteredResults !== deferredFilteredResults;
  return { resultCounts, filteredResults, deferredFilteredResults, isResultsStale };
}
