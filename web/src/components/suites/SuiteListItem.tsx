"use client";

import { useSuitesTabContext } from "./SuitesTabContext";
import SuiteRow from "./SuiteRow";
import EditSuiteForm from "./EditSuiteForm";
import SuiteExpandedPanel from "./SuiteExpandedPanel";
import type { Suite } from "@/gen/ameliso/v1/types_pb";

interface Props {
  suite: Suite;
}

export default function SuiteListItem({ suite }: Props) {
  const { editingSlug, expanded } = useSuitesTabContext();

  return (
    <li>
      {editingSlug === suite.slug ? (
        <EditSuiteForm suiteSlug={suite.slug} />
      ) : (
        <>
          <SuiteRow suite={suite} />
          {expanded === suite.slug && <SuiteExpandedPanel suite={suite} />}
        </>
      )}
    </li>
  );
}
