import { create } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import {
  AffectedCaseSchema,
  CaseResultSchema,
  CaseSchema,
  CoverageEntrySchema,
  RepositorySchema,
  RunMetaSchema,
  SuiteSchema,
} from "@/gen/ameliso/v1/types_pb";
import { ResultStatus, RunStatus } from "@/gen/ameliso/v1/types_pb";

export function makeCase(init: MessageInitShape<typeof CaseSchema> = {}) {
  return create(CaseSchema, {
    path: "auth/login",
    title: "User Login",
    description: "",
    priority: "high",
    tags: [],
    createdAt: "",
    updatedAt: "",
    ...init,
  });
}

export function makeSuite(init: MessageInitShape<typeof SuiteSchema> = {}) {
  return create(SuiteSchema, {
    slug: "smoke",
    name: "Smoke Tests",
    description: "",
    cases: [],
    ...init,
  });
}

export function makeRunMeta(init: MessageInitShape<typeof RunMetaSchema> = {}) {
  return create(RunMetaSchema, {
    id: "2026-01-01-smoke",
    date: "2026-01-01",
    tester: "",
    status: RunStatus.IN_PROGRESS,
    environment: "",
    suite: "smoke",
    ...init,
  });
}

export function makeCaseResult(init: MessageInitShape<typeof CaseResultSchema> = {}) {
  return create(CaseResultSchema, {
    casePath: "auth/login",
    status: ResultStatus.PASSED,
    notes: "",
    ...init,
  });
}

export function makeCoverageEntry(init: MessageInitShape<typeof CoverageEntrySchema> = {}) {
  return create(CoverageEntrySchema, {
    latestStatus: ResultStatus.NEVER,
    lastRunDate: "",
    ...init,
  });
}

export function makeAffectedCase(init: MessageInitShape<typeof AffectedCaseSchema> = {}) {
  return create(AffectedCaseSchema, {
    reason: "file changed",
    ...init,
  });
}

export function makeRepository(init: MessageInitShape<typeof RepositorySchema> = {}) {
  return create(RepositorySchema, {
    id: "owner/repo",
    name: "repo",
    fullName: "owner/repo",
    htmlUrl: "https://github.com/owner/repo",
    addedAt: "2026-01-01",
    installationId: "",
    ...init,
  });
}
