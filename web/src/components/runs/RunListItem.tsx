"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import RunRow from "./RunRow";
import RenameRunForm from "./RenameRunForm";
import ExpandedPanel from "./ExpandedPanel";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";

interface Props {
  run: RunMeta;
}

export default function RunListItem({ run }: Props) {
  const { selectedRunId, renamingRunId } = useRunsTabContext();

  return (
    <li>
      <div className={selectedRunId === run.id ? styles.runCardSelected : styles.runCard}>
        <RunRow run={run} />
        {renamingRunId === run.id && <RenameRunForm run={run} />}
      </div>
      {selectedRunId === run.id && <ExpandedPanel run={run} />}
    </li>
  );
}
