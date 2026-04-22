"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./RepositoriesTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { Repository } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";

interface Props {
  onRepoSelect: (id: string) => void;
  activeRepoId: string;
  installationId?: string;
  setupAction?: string;
  onInstallationHandled?: () => void;
}

export default function RepositoriesTab({
  onRepoSelect,
  activeRepoId,
  installationId,
  setupAction,
  onInstallationHandled,
}: Props) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [installUrl, setInstallUrl] = useState<string>("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, announce] = useAnnounce();
  const [filterAnnouncement, announceFilter] = useAnnounce();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const prevActiveRef = useRef(activeRepoId);
  const prevFilterCountRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reposRes, urlRes] = await Promise.all([
        client.listRepositories({}),
        client.getGitHubInstallUrl({}),
      ]);
      setRepos(reposRes.repositories);
      setInstallUrl(urlRes.url);
      setConfigured(urlRes.configured);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const installationIds = [...new Set(repos.map((r) => r.installationId).filter(Boolean))];
      for (const installationId of installationIds) {
        const res = await client.handleGitHubCallback({ installationId });
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

  // Handle GitHub OAuth callback params passed from the page client
  useEffect(() => {
    if (
      !installationId ||
      (setupAction != null && setupAction !== "install" && setupAction !== "update")
    )
      return;
    onInstallationHandled?.();
    setLoading(true);
    setError(null);
    client
      .handleGitHubCallback({ installationId })
      .then((res) => {
        setRepos((prev) => {
          const ids = new Set(res.repositories.map((r) => r.id));
          return [...prev.filter((r) => !ids.has(r.id)), ...res.repositories];
        });
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [installationId, setupAction, onInstallationHandled]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeRepoId === prevActiveRef.current) return;
    prevActiveRef.current = activeRepoId;
    if (activeRepoId) {
      const repo = repos.find((r) => r.id === activeRepoId);
      if (repo) announce(`${repo.fullName} selected`);
    } else {
      announce("Repository deselected");
    }
  }, [activeRepoId, repos, announce]);

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
  const filteredRepos = q
    ? repos.filter(
        (r) => r.fullName.toLowerCase().includes(q) || r.htmlUrl.toLowerCase().includes(q)
      )
    : repos;

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
            }}
            className={`${styles.btn} ${styles.btnSecondary} ${styles.clearBtnMt}`}
          >
            Clear search
          </button>
        </div>
      )}

      <ul aria-busy={loading} role="list" className={styles.repoList}>
        {filteredRepos.map((repo) => {
          const isActive = activeRepoId === repo.id;
          return (
            <li key={repo.id} className={isActive ? styles.repoCardActive : styles.repoCard}>
              <div className={styles.repoRow}>
                <div className={styles.repoInfo}>
                  <div className={styles.repoNameRow}>
                    <span className={styles.repoName}>{repo.fullName}</span>
                    {isActive && <span className={styles.badgeActive}>Active</span>}
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
                  {!isActive ? (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => {
                        onRepoSelect(repo.id);
                      }}
                    >
                      Use
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnOutline}
                      onClick={() => {
                        onRepoSelect("");
                      }}
                    >
                      Deselect
                    </button>
                  )}
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
