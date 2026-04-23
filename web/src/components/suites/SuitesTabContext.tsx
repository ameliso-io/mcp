"use client";

import { createContext, useContext } from "react";
import type { SuitesTabState } from "./useSuitesTab";

const SuitesTabContext = createContext<SuitesTabState | null>(null);

export function useSuitesTabContext(): SuitesTabState {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return useContext(SuitesTabContext) as SuitesTabState;
}

export { SuitesTabContext };
