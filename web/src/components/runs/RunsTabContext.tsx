"use client";

import { createContext, useContext } from "react";
import type { RunsTabState } from "./useRunsTab";

const RunsTabContext = createContext<RunsTabState | null>(null);

export function useRunsTabContext(): RunsTabState {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return useContext(RunsTabContext) as RunsTabState;
}

export { RunsTabContext };
