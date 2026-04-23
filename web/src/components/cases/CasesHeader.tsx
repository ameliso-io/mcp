"use client";

import styles from "../CasesTab.module.css";
import { useCasesTabContext } from "./CasesTabContext";

export default function CasesHeader() {
  const { showCreate, setShowCreate, lastFocusRef } = useCasesTabContext();

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>Cases</h2>
      <button
        type="button"
        onClick={() => {
          if (!showCreate) lastFocusRef.current = document.activeElement as HTMLElement;
          setShowCreate(!showCreate);
        }}
        className={styles.btn}
      >
        {showCreate ? "Cancel" : "+ New Case"}
      </button>
    </div>
  );
}
