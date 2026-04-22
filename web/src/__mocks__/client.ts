import { vi } from "vitest";
import type { Client } from "@connectrpc/connect";
import type { AmelisoService } from "@/gen/ameliso/v1/service_pb";

// satisfies ensures TypeScript catches missing/extra methods when the proto changes
export const client = {
  listCases: vi.fn().mockResolvedValue({ cases: [] }),
  getCase: vi.fn().mockResolvedValue({ case: undefined, body: "" }),
  createCase: vi.fn().mockResolvedValue({ case: undefined, filePath: "" }),
  updateCase: vi.fn().mockResolvedValue({ case: undefined }),
  deleteCase: vi.fn().mockResolvedValue({ filePath: "" }),
  listSuites: vi.fn().mockResolvedValue({ suites: [] }),
  getSuite: vi.fn().mockResolvedValue({ suite: undefined }),
  createSuite: vi.fn().mockResolvedValue({ suite: undefined, filePath: "" }),
  updateSuite: vi.fn().mockResolvedValue({ suite: undefined }),
  deleteSuite: vi.fn().mockResolvedValue({ filePath: "" }),
  listRuns: vi.fn().mockResolvedValue({ runs: [] }),
  getRun: vi.fn().mockResolvedValue({ run: undefined }),
  createRun: vi.fn().mockResolvedValue({ run: undefined, dirPath: "" }),
  recordResult: vi.fn().mockResolvedValue({ result: undefined }),
  bulkRecordResults: vi.fn().mockResolvedValue({ results: [], pendingCount: 0, totalInScope: 0 }),
  finalizeRun: vi.fn().mockResolvedValue({ run: undefined }),
  deleteRun: vi.fn().mockResolvedValue({ dirPath: "" }),
  getPendingCases: vi.fn().mockResolvedValue({ cases: [], totalInScope: 0 }),
  getCoverageReport: vi.fn().mockResolvedValue({ entries: [], runCount: 0 }),
  getAffectedCases: vi.fn().mockResolvedValue({ cases: [], reason: "" }),
  getGitHubInstallUrl: vi.fn().mockResolvedValue({ url: "", configured: false }),
  handleGitHubCallback: vi.fn().mockResolvedValue({ repositories: [] }),
  listRepositories: vi.fn().mockResolvedValue({ repositories: [] }),
  syncRepository: vi.fn().mockResolvedValue({ repository: undefined }),
  removeRepository: vi.fn().mockResolvedValue({}),
} satisfies Record<keyof Client<typeof AmelisoService>, unknown>;
