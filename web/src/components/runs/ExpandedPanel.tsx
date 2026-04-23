"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import CompletedRunView from "./CompletedRunView";
import InProgressRunView from "./InProgressRunView";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";

interface Props {
  run: RunMeta;
}

export default function ExpandedPanel({ run }: Props) {
  const { loadingPending } = useRunsTabContext();

  return (
    <div className={styles.expandedPanel} aria-busy={loadingPending}>
      {loadingPending ? (
        <div className={styles.panelLoading} role="status">
          Loading…
        </div>
      ) : run.status !== RunStatus.IN_PROGRESS ? (
        <CompletedRunView />
      ) : (
        <InProgressRunView runId={run.id} />
      )}
    </div>
  );
}
