"use client";

import styles from "../SuitesTab.module.css";
import { useSuitesTabContext } from "./SuitesTabContext";

interface Props {
  suiteSlug: string;
}

export default function EditSuiteForm({ suiteSlug }: Props) {
  const {
    editName,
    setEditName,
    editDesc,
    setEditDesc,
    editCases,
    setEditCases,
    editNewSlug,
    setEditNewSlug,
    saving,
    handleUpdate,
    setEditingSlug,
    lastFocusRef,
  } = useSuitesTabContext();

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitleSm}>Edit: {suiteSlug}</h3>
      <form
        aria-label={`Edit suite ${suiteSlug}`}
        onSubmit={handleUpdate}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          setEditingSlug(null);
          lastFocusRef.current?.focus();
        }}
        className={styles.formGridSm}
      >
        <div>
          <label className={`${styles.label} ${styles.requiredLabel}`}>
            Name
            <input
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
              }}
              required
              maxLength={255}
              autoFocus
              className={styles.input}
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <label className={styles.label}>
            Description
            <textarea
              value={editDesc}
              onChange={(e) => {
                setEditDesc(e.target.value);
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
              value={editCases}
              onChange={(e) => {
                setEditCases(e.target.value);
              }}
              className={styles.input}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div className={styles.fullCol}>
          <label className={styles.label}>
            Rename slug (optional)
            <input
              value={editNewSlug}
              onChange={(e) => {
                setEditNewSlug(e.target.value);
              }}
              pattern="[a-z0-9_-]+"
              title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)"
              maxLength={100}
              className={styles.input}
              placeholder="leave blank to keep current slug"
            />
          </label>
        </div>
        <div className={styles.formActions}>
          <button type="submit" disabled={saving} className={styles.btnSaveSm}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingSlug(null);
              lastFocusRef.current?.focus();
            }}
            className={styles.btnCancelSm}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
