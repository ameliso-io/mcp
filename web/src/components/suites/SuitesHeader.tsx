"use client";

import styles from "../SuitesTab.module.css";
import { useSuitesTabContext } from "./SuitesTabContext";

export default function SuitesHeader() {
  const { showCreate, setShowCreate, lastFocusRef } = useSuitesTabContext();

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>Suites</h2>
      <button
        type="button"
        onClick={() => {
          if (!showCreate) lastFocusRef.current = document.activeElement as HTMLElement;
          setShowCreate(!showCreate);
        }}
        className={styles.btn}
      >
        {showCreate ? "Cancel" : "+ New Suite"}
      </button>
    </div>
  );
}
