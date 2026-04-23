"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import styles from "./RepositoriesTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Repository } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";

interface Props {
  installationId?: string | undefined;
  setupAction?: string | undefined;
  onInstallationHandled?: (() => void) | undefined;
  initialSearch?: string | undefined;
  onSearchChange?: ((q: string) => void) | undefined;
}

export default function RepositoriesTab({
  installationId,
  setupAction,
  onInstallationHandled,
  initialSearch,
  onSearchChange,
}: Props) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [installUrl, setInstallUrl] = useState<string>("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, announce] = useAnnounce();
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const prevFilterCountRef = useRef<number | null>(null);

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    /* v8 ignore next — abort guard */
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const { signal } = ctrl;
    setLoading(true);
    setError(null);
    try {
      const [reposRes, urlRes] = await Promise.all([
        client.listRepositories({}, { signal }),
        client.getGitHubInstallUrl({}, { signal }),
      ]);
      /* v8 ignore next 2 — abort guard */
      if (signal.aborted) return;
      setRepos(reposRes.repositories);
      setInstallUrl(urlRes.url);
      setConfigured(urlRes.configured);
    } catch (e) {
      /* v8 ignore next 2 — abort guard */
      if (signal.aborted) return;
      setError(errorMessage(e));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const installationIds = [...new Set(repos.map((r) => r.installationId).filter(Boolean))];
      const results = await Promise.all(
        installationIds.map((installationId) => client.handleGitHubCallback({ installationId }))
      );
      for (const res of results) {
        setRepos((prev) => {
          const ids = new Set(res.repositories.map((r) => r.id));
          return [...prev.filter((r) => !ids.has(r.id)), ...res.repositories];
        });
      }
      announce("Repositories refreshed");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [repos, announce]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  // Handle GitHub OAuth callback params passed from the page client
  useEffect(() => {
    if (
      !installationId ||
      (setupAction != null && setupAction !== "install" && setupAction !== "update")
    )
      return;
    onInstallationHandled?.();
    const id = installationId;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await client.handleGitHubCallback({ installationId: id }, { signal });
        /* v8 ignore next 2 — abort guard */
        if (signal.aborted) return;
        setRepos((prev) => {
          const ids = new Set(res.repositories.map((r) => r.id));
          return [...prev.filter((r) => !ids.has(r.id)), ...res.repositories];
        });
      } catch (e: unknown) {
        if (!signal.aborted) setError(errorMessage(e));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
    void run();
    return () => {
      ctrl.abort();
    };
  }, [installationId, setupAction, onInstallationHandled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSync(id: string) {
    setSyncing(id);
    setError(null);
    try {
      const res = await client.syncRepository({ id });
      if (res.repository) {
        const synced = res.repository;
        setRepos((prev) => prev.map((r) => (r.id === id ? synced : r)));
        announce(`Sync completed for ${synced.fullName}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSyncing(null);
    }
  }

  const q = search.trim().toLowerCase();
  const filteredRepos = useMemo(
    () =>
      q
        ? repos.filter(
            (r) => r.fullName.toLowerCase().includes(q) || r.htmlUrl.toLowerCase().includes(q)
          )
        : repos,
    [repos, q]
  );

  useEffect(() => {
    if (loading || !q) return;
    const count = filteredRepos.length;
    if (prevFilterCountRef.current !== null && prevFilterCountRef.current !== count) {
      announceFilter(count === 1 ? "1 repository found" : `${count} repositories found`);
    }
    prevFilterCountRef.current = count;
  }, [filteredRepos.length, loading, q, announceFilter]);

  async function handleRemove(id: string) {
    setError(null);
    const repo = repos.find((r) => r.id === id);
    try {
      await client.removeRepository({ id });
      setConfirmingRemove(null);
      setRepos((prev) => prev.filter((r) => r.id !== id));
      announce(`${repo?.fullName ?? /* v8 ignore next */ id} removed`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {filterAnnouncement}
      </div>
      <div className={styles.header}>
        <h2 className={styles.title}>Repositories</h2>
        <div className={styles.headerActions}>
          {repos.length > 0 && (
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={refreshing}
              aria-label="Refresh All"
              className={styles.btnOutline}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh All"}
            </button>
          )}
          {configured && installUrl ? (
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.connectBtn}
            >
              + Connect GitHub Repo
            </a>
          ) : null}
        </div>
        {!configured && (
          <p className={styles.githubHint}>
            Set <code>GITHUB_APP_ID</code> + <code>GITHUB_APP_PRIVATE_KEY</code> to enable GitHub
            integration
          </p>
        )}
      </div>

      {repos.length > 0 && (
        <div className={styles.searchWrapper}>
          <input
            type="search"
            aria-label="Search repositories"
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              onSearchChange?.(e.target.value);
            }}
            className={styles.searchInput}
          />
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
        </div>
      )}

      {error && (
        <div className={styles.errorCard} role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
            }}
            className={styles.errorDismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {loading && (
        <div className={styles.loadingMsg} role="status">
          Loading…
        </div>
      )}

      {!loading && repos.length === 0 && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No repositories connected</p>
          {configured ? (
            <p className={styles.emptyDesc}>
              Click &quot;Connect GitHub Repo&quot; to install the GitHub App on your repositories.
            </p>
          ) : (
            <p className={styles.emptyDesc}>
              Configure GitHub App environment variables to enable repository connection.
            </p>
          )}
        </div>
      )}

      {!loading && repos.length > 0 && filteredRepos.length === 0 && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No results for &quot;{search}&quot;</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onSearchChange?.("");
            }}
            className={`${styles.btn} ${styles.btnSecondary} ${styles.clearBtnMt}`}
          >
            Clear search
          </button>
        </div>
      )}

      <ul
        aria-busy={loading || refreshing}
        role="list"
        className={
          refreshing ? `${styles.repoList} ${styles.repoListStale}` : styles.repoList
        }
      >
        {filteredRepos.map((repo) => {
          return (
            <li key={repo.id} className={styles.repoCard}>
              <div className={styles.repoRow}>
                <div className={styles.repoInfo}>
                  <div className={styles.repoNameRow}>
                    <Link
                      href={`/repositories/${repo.id}/overview` as Route}
                      className={styles.repoName}
                    >
                      {repo.fullName}
                    </Link>
                  </div>
                  <div className={styles.repoUrl}>
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.repoUrlLink}
                    >
                      {repo.htmlUrl}
                    </a>
                  </div>
                </div>
                <div className={styles.repoActions}>
                  <Link
                    href={`/repositories/${repo.id}/overview` as Route}
                    className={styles.btnPrimary}
                  >
                    Use
                  </Link>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={syncing === repo.id}
                    onClick={() => handleSync(repo.id)}
                  >
                    {syncing === repo.id ? "Syncing…" : "Sync"}
                  </button>
                  {confirmingRemove === repo.id ? (
                    <>
                      <span className={styles.confirmText}>Remove?</span>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => handleRemove(repo.id)}
                        aria-label={`Confirm remove ${repo.fullName}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={() => {
                          setConfirmingRemove(null);
                        }}
                        aria-label="Cancel remove"
                        autoFocus
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => {
                        setConfirmingRemove(repo.id);
                      }}
                      aria-label={`Remove ${repo.fullName}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {repo.addedAt && (
                <div className={styles.label}>
                  Added <time dateTime={repo.addedAt}>{repo.addedAt}</time>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
