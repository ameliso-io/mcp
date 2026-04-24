---
# This file is managed by Centy. Use the Centy CLI to modify it.
createdAt: 2026-04-24T12:33:04.460899+00:00
updatedAt: 2026-04-24T12:33:04.460899+00:00
---

# Testing Strategy

## Concept

A **Testing Strategy** is a reusable, agent-executable instruction set describing *how* to drive a test case — not what to verify (that's the case body) but how to operate during execution. Includes tool usage, human checkpoints, and preconditions.

Example strategy body:
> Use Playwright MCP → navigate to /login → ask user for username and password → fill credentials and submit → verify redirect to dashboard.

---

## Data Model

Many-to-many relationship: a case can link multiple strategies, a strategy can apply to many cases.

```
Strategy  ←→  Case  (many:many, via case frontmatter)
                ↓
              Run   (strategy overrides per case)
                ↓
            CaseResult  (records which strategy was actually used)
```

---

## Git-Native File Layout

```
strategies/
  {slug}.md              ← strategy definition

cases/{cat}/{slug}.md    ← frontmatter lists strategy slugs

runs/{date}-{slug}/
  run.yaml               ← strategy overrides per case
  results/{case}.md      ← records which strategy was used
```

---

## File Formats

### Strategy file (`strategies/browser-login.md`)

```markdown
---
title: Browser Login via Playwright
tools: [playwright-mcp]
---

Use Playwright MCP → navigate to /login.
Ask user for username + password.
Fill and submit.
Verify redirect to dashboard.
```

### Case frontmatter (links strategies)

```yaml
---
title: User Login
strategies: [browser-login, api-auth, mobile-webview]
---
```

### Run-level override (`run.yaml`)

```yaml
strategy_overrides:
  auth/login: browser-login
  auth/sso: api-auth
```

### CaseResult records strategy used (`results/auth/login.md`)

```markdown
---
status: passed
strategy: browser-login
---

Tested via Playwright. Asked user for credentials. Redirect confirmed.
```

---

## Agent Workflow

`CreateRun` response returns `Case.body` + `strategies` list per case. Agent gets all candidate strategies in one shot, selects based on `run.yaml` overrides or decides autonomously. No extra RPC needed.

1. `CreateRun` → get pending cases with their linked strategies
2. For each case: read strategy body → execute using named tools → record result with strategy slug used
3. `FinalizeRun`

---

## Server Changes

- New `Strategy` proto message: `slug`, `title`, `tools`, `body`
- New RPCs: `CreateStrategy`, `GetStrategy`, `ListStrategies`, `UpdateStrategy`, `DeleteStrategy`
- `Case` proto: add `repeated string strategies` field (slugs)
- `CaseResult` proto: add `string strategy` field (slug used)
- `RunMeta` / `run.yaml`: add `strategy_overrides` map (case_path → strategy_slug)
- Webhook sync: handle `strategies/**/*.md` changes same as cases
- DB: new `strategies` table, `case_strategies` join table

## Web Changes

- New **Strategies** tab (list, create, edit, delete)
- Case editor: multi-select strategies to link
- Run creation: per-case strategy override picker
- Run result detail: show which strategy was used + its body at time of run

---

## Open Questions

- When multiple strategies linked to a case and no override set — agent decides, or UI forces explicit selection before run starts?
- Can a run add an ad-hoc strategy not pre-linked on the case?
- Strategy versioning: git handles history, but stale strategies (app UI changes) need an owner — who is responsible?

