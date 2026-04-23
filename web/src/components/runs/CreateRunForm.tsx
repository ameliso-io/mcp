"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";

export default function CreateRunForm() {
  const {
    newSlug, setNewSlug, newTester, setNewTester, newEnv, setNewEnv,
    newSuite, setNewSuite, newCases, setNewCases, newCommitSha, setNewCommitSha,
    creating, handleCreate, setShowCreate, lastFocusRef,
  } = useRunsTabContext();

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Create Run</h3>
      <form
        aria-label="Create Run"
        onSubmit={handleCreate}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          setShowCreate(false);
          lastFocusRef.current?.focus();
        }}
        className={styles.formGrid}
      >
        <div>
          <label className={`${styles.label} ${styles.requiredLabel}`}>
            Slug
            <input value={newSlug} onChange={(e) => { setNewSlug(e.target.value); }} required pattern="[a-z0-9_-]+" title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)" maxLength={100} autoFocus className={styles.input} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div>
          <label className={styles.label}>
            Tester
            <input value={newTester} onChange={(e) => { setNewTester(e.target.value); }} maxLength={255} className={styles.input} />
          </label>
        </div>
        <div>
          <label className={styles.label}>
            Environment
            <input value={newEnv} onChange={(e) => { setNewEnv(e.target.value); }} maxLength={255} className={styles.input} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div>
          <label className={styles.label}>
            Suite (optional)
            <input value={newSuite} onChange={(e) => { setNewSuite(e.target.value); }} maxLength={100} className={styles.input} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div className={styles.fullCol}>
          <label className={styles.label}>
            Inline cases (optional, comma-separated paths)
            <input value={newCases} onChange={(e) => { setNewCases(e.target.value); }} className={styles.input} placeholder="auth/login, billing/checkout" />
          </label>
        </div>
        <div>
          <label className={styles.label}>
            Commit SHA (optional)
            <input value={newCommitSha} onChange={(e) => { setNewCommitSha(e.target.value); }} maxLength={40} className={styles.input} placeholder="HEAD commit SHA" />
          </label>
        </div>
        <div className={styles.fullCol}>
          <button type="submit" disabled={creating} className={styles.btnGreen}>
            {creating ? "Creating…" : "Create Run"}
          </button>
        </div>
      </form>
    </div>
  );
}
