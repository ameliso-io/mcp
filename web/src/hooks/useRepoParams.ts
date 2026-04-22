"use client";

import { useParams } from "next/navigation";

export function useRepoParams() {
  const params = useParams<{ org: string; repo: string }>();
  const org = params.org;
  const repo = params.repo;
  const repoId = `${org}/${repo}`;
  const basePath = `/repositories/${org}/${repo}`;
  return { org, repo, repoId, basePath } as const;
}
