"use client";

import { useState, useEffect, useCallback } from "react";
import { client } from "../client";
import { errorMessage } from "../errorMessage";
import type { Repository } from "../gen/ameliso/v1/types_pb";
import styles from "./RepositoriesTab.module.css";

interface Props {
  onRepoSelect: (id: string) => void;
  activeRepoId: string;
}

export default function RepositoriesTab({ onRepoSelect, activeRepoId }: Props) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [installUrl, setInstallUrl] = useState<string>("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [repos]);

  // Handle GitHub callback: ?installation_id=... in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id");
    const setupAction = params.get("setup_action");
    if (
      installationId &&
      (setupAction === "install" || setupAction === "update" || setupAction == null)
    ) {
      // Clear the URL params so we don't reprocess on re-render
      window.history.replaceState({}, "", window.location.pathname);
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
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync(id: string) {
    setSyncing(id);
    setError(null);
    try {
      const res = await client.syncRepository({ id });
      if (res.repository) {
        setRepos((prev) => prev.map((r) => (r.id === id ? res.repository! : r)));
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

  async function handleRemove(id: string) {
    if (!confirm("Remove this repository connection?")) return;
    setError(null);
    try {
      await client.removeRepository({ id });
      setRepos((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Repositories</h2>
        <div className={styles.headerActions}>
          {repos.length > 0 && (
            <button onClick={handleRefreshAll} disabled={refreshing} className={styles.btnOutline}>
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
            onChange={(e) => setSearch(e.target.value)}
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
            onClick={() => setError(null)}
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
            onClick={() => setSearch("")}
            className={`${styles.btn} ${styles.btnSecondary} ${styles.clearBtnMt}`}
          >
            Clear search
          </button>
        </div>
      )}

      {filteredRepos.map((repo) => {
        const isActive = activeRepoId === repo.id;
        return (
          <div key={repo.id} className={isActive ? styles.repoCardActive : styles.repoCard}>
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
                  <button className={styles.btnPrimary} onClick={() => onRepoSelect(repo.id)}>
                    Use
                  </button>
                ) : (
                  <button className={styles.btnOutline} onClick={() => onRepoSelect("")}>
                    Deselect
                  </button>
                )}
                <button
                  className={styles.btnSecondary}
                  disabled={syncing === repo.id}
                  onClick={() => handleSync(repo.id)}
                >
                  {syncing === repo.id ? "Syncing…" : "Sync"}
                </button>
                <button className={styles.btnDanger} onClick={() => handleRemove(repo.id)}>
                  Remove
                </button>
              </div>
            </div>
            {repo.addedAt && <div className={styles.label}>Added {repo.addedAt}</div>}
          </div>
        );
      })}
    </div>
  );
}
