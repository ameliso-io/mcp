import type { Route } from "next";
import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useRouteReplace(tabPath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      startTransition(() => {
        router.replace((qs ? `${tabPath}?${qs}` : tabPath) as Route, { scroll: false });
      });
    },
    [router, searchParams, tabPath]
  );
}
