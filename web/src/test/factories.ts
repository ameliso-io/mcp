import { create } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import {
  AffectedCaseSchema,
  CaseResultSchema,
  CaseSchema,
  CoverageEntrySchema,
  RepositorySchema,
  RunMetaSchema,
  RunSchema,
  SuiteSchema,
} from "@/gen/ameliso/v1/types_pb";
import { ResultStatus, RunStatus } from "@/gen/ameliso/v1/types_pb";
import {
  BulkRecordResultsResponseSchema,
  CreateCaseResponseSchema,
  CreateRunResponseSchema,
  CreateSuiteResponseSchema,
  DeleteCaseResponseSchema,
  DeleteRunResponseSchema,
  DeleteSuiteResponseSchema,
  FinalizeRunResponseSchema,
  GetAffectedCasesResponseSchema,
  GetCaseResponseSchema,
  GetCoverageReportResponseSchema,
  GetGitHubInstallUrlResponseSchema,
  GetPendingCasesResponseSchema,
  GetRunResponseSchema,
  HandleGitHubCallbackResponseSchema,
  ListCasesResponseSchema,
  ListRepositoriesResponseSchema,
  ListRunsResponseSchema,
  ListSuitesResponseSchema,
  RecordResultResponseSchema,
  RemoveRepositoryResponseSchema,
  SyncRepositoryResponseSchema,
  UpdateCaseResponseSchema,
  UpdateSuiteResponseSchema,
} from "@/gen/ameliso/v1/service_pb";

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

export function makeActiveRunStatus(init: MessageInitShape<typeof ActiveRunStatusSchema> = {}) {
  return create(ActiveRunStatusSchema, {
    runId: "run-abc",
    tester: "",
    suite: "",
    date: "2026-01-01",
    pendingCases: 0,
    totalInScope: 0,
    commitSha: "",
    environment: "",
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

export function makeRun(init: MessageInitShape<typeof RunSchema> = {}) {
  return create(RunSchema, init);
}

// Response factories

export function makeListCasesResponse(init: MessageInitShape<typeof ListCasesResponseSchema> = {}) {
  return create(ListCasesResponseSchema, init);
}

export function makeGetCaseResponse(init: MessageInitShape<typeof GetCaseResponseSchema> = {}) {
  return create(GetCaseResponseSchema, init);
}

export function makeCreateCaseResponse(
  init: MessageInitShape<typeof CreateCaseResponseSchema> = {}
) {
  return create(CreateCaseResponseSchema, init);
}

export function makeUpdateCaseResponse(
  init: MessageInitShape<typeof UpdateCaseResponseSchema> = {}
) {
  return create(UpdateCaseResponseSchema, init);
}

export function makeDeleteCaseResponse(
  init: MessageInitShape<typeof DeleteCaseResponseSchema> = {}
) {
  return create(DeleteCaseResponseSchema, init);
}

export function makeListSuitesResponse(
  init: MessageInitShape<typeof ListSuitesResponseSchema> = {}
) {
  return create(ListSuitesResponseSchema, init);
}

export function makeCreateSuiteResponse(
  init: MessageInitShape<typeof CreateSuiteResponseSchema> = {}
) {
  return create(CreateSuiteResponseSchema, init);
}

export function makeUpdateSuiteResponse(
  init: MessageInitShape<typeof UpdateSuiteResponseSchema> = {}
) {
  return create(UpdateSuiteResponseSchema, init);
}

export function makeDeleteSuiteResponse(
  init: MessageInitShape<typeof DeleteSuiteResponseSchema> = {}
) {
  return create(DeleteSuiteResponseSchema, init);
}

export function makeListRunsResponse(init: MessageInitShape<typeof ListRunsResponseSchema> = {}) {
  return create(ListRunsResponseSchema, init);
}

export function makeGetRunResponse(init: MessageInitShape<typeof GetRunResponseSchema> = {}) {
  return create(GetRunResponseSchema, init);
}

export function makeCreateRunResponse(init: MessageInitShape<typeof CreateRunResponseSchema> = {}) {
  return create(CreateRunResponseSchema, init);
}

export function makeRecordResultResponse(
  init: MessageInitShape<typeof RecordResultResponseSchema> = {}
) {
  return create(RecordResultResponseSchema, init);
}

export function makeBulkRecordResultsResponse(
  init: MessageInitShape<typeof BulkRecordResultsResponseSchema> = {}
) {
  return create(BulkRecordResultsResponseSchema, init);
}

export function makeFinalizeRunResponse(
  init: MessageInitShape<typeof FinalizeRunResponseSchema> = {}
) {
  return create(FinalizeRunResponseSchema, init);
}

export function makeDeleteRunResponse(init: MessageInitShape<typeof DeleteRunResponseSchema> = {}) {
  return create(DeleteRunResponseSchema, init);
}

export function makeGetPendingCasesResponse(
  init: MessageInitShape<typeof GetPendingCasesResponseSchema> = {}
) {
  return create(GetPendingCasesResponseSchema, init);
}

export function makeGetCoverageReportResponse(
  init: MessageInitShape<typeof GetCoverageReportResponseSchema> = {}
) {
  return create(GetCoverageReportResponseSchema, init);
}

export function makeGetAffectedCasesResponse(
  init: MessageInitShape<typeof GetAffectedCasesResponseSchema> = {}
) {
  return create(GetAffectedCasesResponseSchema, init);
}

export function makeGetGitHubInstallUrlResponse(
  init: MessageInitShape<typeof GetGitHubInstallUrlResponseSchema> = {}
) {
  return create(GetGitHubInstallUrlResponseSchema, init);
}

export function makeHandleGitHubCallbackResponse(
  init: MessageInitShape<typeof HandleGitHubCallbackResponseSchema> = {}
) {
  return create(HandleGitHubCallbackResponseSchema, init);
}

export function makeListRepositoriesResponse(
  init: MessageInitShape<typeof ListRepositoriesResponseSchema> = {}
) {
  return create(ListRepositoriesResponseSchema, init);
}

export function makeSyncRepositoryResponse(
  init: MessageInitShape<typeof SyncRepositoryResponseSchema> = {}
) {
  return create(SyncRepositoryResponseSchema, init);
}

export function makeRemoveRepositoryResponse(
  init: MessageInitShape<typeof RemoveRepositoryResponseSchema> = {}
) {
  return create(RemoveRepositoryResponseSchema, init);
}
