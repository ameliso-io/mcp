"use client";

import styles from "../CasesTab.module.css";
import { useCasesTabContext } from "./CasesTabContext";
import { Priority } from "@/gen/ameliso/v1/types_pb";

export default function CasesFilterBar() {
  const { loading, deferredCases, cases, search, setSearch, priorityFilter, setPriorityFilter, tagFilter, setTagFilter, suiteFilter, setSuiteFilter, sortBy, setSortBy, startSortTransition, allTags } = useCasesTabContext();
  const isStale = cases !== deferredCases;

  return (
    <div className={styles.filterBar} aria-busy={loading || undefined}>
      <input type="search" aria-label="Search cases" placeholder="Search cases…" value={search} onChange={(e) => { setSearch(e.target.value); }} className={styles.searchInput} autoComplete="off" spellCheck={false} />
      <select aria-label="Filter by priority" value={priorityFilter} onChange={(e) => { setPriorityFilter(Number(e.target.value)); }} className={styles.filterSelect}>
        <option value={Priority.UNSPECIFIED}>All priorities</option>
        <option value={Priority.LOW}>Low</option>
        <option value={Priority.MEDIUM}>Medium</option>
        <option value={Priority.HIGH}>High</option>
      </select>
      {allTags.length > 0 && (
        <select aria-label="Filter by tag" value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); }} className={styles.filterSelect}>
          <option value="">All tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      <input type="search" aria-label="Filter by suite slug" placeholder="Suite slug…" value={suiteFilter} onChange={(e) => { setSuiteFilter(e.target.value); }} className={styles.filterSelect} />
      <select aria-label="Sort cases" value={sortBy} onChange={(e) => { startSortTransition(() => { setSortBy(e.target.value as "path" | "priority"); }); }} className={styles.filterSelect}>
        <option value="priority">Sort: Priority</option>
        <option value="path">Sort: Path</option>
      </select>
      {!loading && deferredCases.length > 0 && (
        <span className={isStale ? `${styles.caseCount} ${styles.caseCountStale}` : styles.caseCount}>
          {deferredCases.length} case{deferredCases.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
