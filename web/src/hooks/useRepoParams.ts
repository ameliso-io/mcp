import { useParams } from "next/navigation";

export function useRepoParams() {
  const { org, repo } = useParams<{ org: string; repo: string }>();
  return {
    org,
    repo,
    repoId: `${org}/${repo}`,
    basePath: `/repositories/${org}/${repo}`,
  };
}
