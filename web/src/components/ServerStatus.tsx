"use client";

import { useEffect, useState } from "react";
import styles from "./ServerStatus.module.css";
import { client } from "@/client";

type Status = "connecting" | "online" | "offline";

const POLL_INTERVAL_MS = 30_000;

export default function ServerStatus() {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await client.listRepositories({});
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    void ping();
    const id = setInterval(() => void ping(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const label = status === "connecting" ? "Connecting" : status === "online" ? "Online" : "Offline";

  return (
    <div
      className={styles.wrapper}
      aria-label={`Server status: ${label}`}
      title={`Server: ${label}`}
    >
      <span className={`${styles.dot} ${styles[status]}`} />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
