"use client";

import styles from "../CasesTab.module.css";
import { useCasesTabContext } from "./CasesTabContext";
import { Priority } from "@/gen/ameliso/v1/types_pb";

interface Props {
  casePath: string;
}

export default function EditCaseForm({ casePath }: Props) {
  const { editTitle, setEditTitle, editDesc, setEditDesc, editPriority, setEditPriority, editTags, setEditTags, editBody, setEditBody, editNewPath, setEditNewPath, saving, handleUpdate, setEditingPath, lastFocusRef } = useCasesTabContext();

  return (
    <form
      aria-label={`Edit case ${casePath}`}
      onSubmit={handleUpdate}
      onKeyDown={(e) => { if (e.key !== "Escape") return; e.preventDefault(); setEditingPath(null); lastFocusRef.current?.focus(); }}
      className={styles.formGridSm}
    >
      <div>
        <label className={`${styles.labelSm} ${styles.requiredLabel}`}>
          Title
          <input autoFocus value={editTitle} onChange={(e) => { setEditTitle(e.target.value); }} required maxLength={255} className={styles.input} />
        </label>
      </div>
      <div>
        <label className={styles.labelSm}>
          Priority
          <select value={editPriority} onChange={(e) => { setEditPriority(Number(e.target.value)); }} className={styles.input}>
            <option value={Priority.LOW}>Low</option>
            <option value={Priority.MEDIUM}>Medium</option>
            <option value={Priority.HIGH}>High</option>
          </select>
        </label>
      </div>
      <div className={styles.fullCol}>
        <label className={styles.labelSm}>
          Description
          <textarea value={editDesc} onChange={(e) => { setEditDesc(e.target.value); }} rows={3} maxLength={1000} className={styles.textarea} />
        </label>
      </div>
      <div className={styles.fullCol}>
        <label className={styles.labelSm}>
          Tags (comma-separated)
          <input value={editTags} onChange={(e) => { setEditTags(e.target.value); }} className={styles.input} />
        </label>
      </div>
      <div className={styles.fullCol}>
        <label className={styles.labelSm}>
          Steps / Body (Markdown)
          <textarea value={editBody} onChange={(e) => { setEditBody(e.target.value); }} rows={8} className={styles.textarea} />
        </label>
      </div>
      <div className={styles.fullCol}>
        <label className={styles.labelSm}>
          Rename path (optional)
          <input value={editNewPath} onChange={(e) => { setEditNewPath(e.target.value); }} pattern="[a-z0-9_-]+(/[a-z0-9_-]+)*" title="Lowercase letters (a-z), digits, hyphens, underscores; segments separated by / (e.g. auth/login)" maxLength={200} className={styles.input} placeholder="leave blank to keep current path" />
        </label>
      </div>
      <div className={styles.formActions}>
        <button type="submit" disabled={saving} className={styles.btnSaveSm}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => { setEditingPath(null); lastFocusRef.current?.focus(); }} className={styles.btnCancelSm}>Cancel</button>
      </div>
    </form>
  );
}
