"use client";

import styles from "../CasesTab.module.css";
import { useCasesTabContext } from "./CasesTabContext";
import CaseRow from "./CaseRow";
import EditCaseForm from "./EditCaseForm";
import CaseExpandedPanel from "./CaseExpandedPanel";
import type { Case } from "@/gen/ameliso/v1/types_pb";

interface Props {
  c: Case;
}

export default function CaseListItem({ c }: Props) {
  const { expandedPath, editingPath } = useCasesTabContext();
  const isOpen = expandedPath === c.path || editingPath === c.path;

  return (
    <li>
      <div className={isOpen ? styles.caseCardOpen : styles.caseCard}>
        {editingPath === c.path ? <EditCaseForm casePath={c.path} /> : <CaseRow c={c} />}
      </div>
      {expandedPath === c.path && editingPath !== c.path && <CaseExpandedPanel />}
    </li>
  );
}
