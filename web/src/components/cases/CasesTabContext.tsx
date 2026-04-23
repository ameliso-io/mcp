"use client";

import { createContext, useContext } from "react";
import type { CasesTabState } from "./useCasesTab";

const CasesTabContext = createContext<CasesTabState | null>(null);

export function useCasesTabContext(): CasesTabState {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return useContext(CasesTabContext) as CasesTabState;
}

export { CasesTabContext };
