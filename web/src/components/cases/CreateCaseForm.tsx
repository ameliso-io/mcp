"use client";

import styles from "../CasesTab.module.css";
import { useCasesTabContext } from "./CasesTabContext";
import { Priority } from "@/gen/ameliso/v1/types_pb";

export default function CreateCaseForm() {
  const {
    newPath,
    setNewPath,
    newTitle,
    setNewTitle,
    newDesc,
    setNewDesc,
    newPriority,
    setNewPriority,
    newTags,
    setNewTags,
    newBody,
    setNewBody,
    creating,
    handleCreate,
    setShowCreate,
    lastFocusRef,
  } = useCasesTabContext();

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Create Case</h3>
      <form
        aria-label="Create Case"
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
            Path (e.g. auth/login)
            <input
              value={newPath}
              onChange={(e) => {
                setNewPath(e.target.value);
              }}
              required
              pattern="[a-z0-9_-]+(/[a-z0-9_-]+)*"
              title="Lowercase letters (a-z), digits, hyphens, underscores; segments separated by / (e.g. auth/login)"
              maxLength={200}
              autoFocus
              className={styles.input}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div>
          <label className={`${styles.label} ${styles.requiredLabel}`}>
            Title
            <input
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
              }}
              required
              maxLength={255}
              className={styles.input}
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
        <div>
          <label className={styles.label}>
            Priority
            <select
              value={newPriority}
              onChange={(e) => {
                setNewPriority(Number(e.target.value));
              }}
              className={styles.input}
            >
              <option value={Priority.LOW}>Low</option>
              <option value={Priority.MEDIUM}>Medium</option>
              <option value={Priority.HIGH}>High</option>
            </select>
          </label>
        </div>
        <div>
          <label className={styles.label}>
            Tags (comma-separated)
            <input
              value={newTags}
              onChange={(e) => {
                setNewTags(e.target.value);
              }}
              className={styles.input}
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <label className={styles.label}>
            Steps / Body (Markdown)
            <textarea
              value={newBody}
              onChange={(e) => {
                setNewBody(e.target.value);
              }}
              placeholder={"## Steps\n\n1. \n\n## Expected Result\n\n"}
              rows={6}
              className={styles.textarea}
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <button type="submit" disabled={creating} className={styles.btnGreen}>
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
