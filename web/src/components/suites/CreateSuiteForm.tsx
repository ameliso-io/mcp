"use client";

import styles from "../SuitesTab.module.css";
import { useSuitesTabContext } from "./SuitesTabContext";

export default function CreateSuiteForm() {
  const {
    newSlug,
    setNewSlug,
    newName,
    setNewName,
    newDesc,
    setNewDesc,
    newCases,
    setNewCases,
    creating,
    handleCreate,
    setShowCreate,
    lastFocusRef,
  } = useSuitesTabContext();

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Create Suite</h3>
      <form
        aria-label="Create Suite"
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
            <input
              value={newSlug}
              onChange={(e) => {
                setNewSlug(e.target.value);
              }}
              required
              pattern="[a-z0-9_-]+"
              title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)"
              maxLength={100}
              autoFocus
              className={styles.input}
              placeholder="e.g. smoke"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div>
          <label className={`${styles.label} ${styles.requiredLabel}`}>
            Name
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
              }}
              required
              maxLength={255}
              className={styles.input}
              placeholder="e.g. Smoke Tests"
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <label className={styles.label}>
            Description
            <textarea
              value={newDesc}
              onChange={(e) => {
                setNewDesc(e.target.value);
              }}
              rows={3}
              maxLength={1000}
              className={styles.textarea}
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <label className={styles.label}>
            Cases (comma-separated paths)
            <input
              value={newCases}
              onChange={(e) => {
                setNewCases(e.target.value);
              }}
              className={styles.input}
              placeholder="auth/login, auth/logout"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <button type="submit" disabled={creating} className={styles.btnGreen}>
            {creating ? "Creating…" : "Create Suite"}
          </button>
        </div>
      </form>
    </div>
  );
}
