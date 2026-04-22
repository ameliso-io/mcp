# GitHub App Setup (Dev Environment)

## 1. Create GitHub App

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.

| Field                  | Value                                          |
| ---------------------- | ---------------------------------------------- |
| App name               | `ameliso-dev` (or anything)                    |
| Homepage URL           | `http://localhost:5173`                        |
| Setup URL              | `http://localhost:5173`                        |
| Webhook URL            | `http://<your-host>:8080/webhook/github`       |
| Webhook secret         | Any random string (save it — used as env var)  |
| Webhook active         | ✅ Checked                                     |
| Repository permissions | **Contents**: Read & Write                     |
| Subscribe to events    | ✅ **Push**                                    |
| Where installed        | "Only on this account"                         |

The **Setup URL** is critical — GitHub redirects back to it with `?installation_id=<id>&setup_action=install` after install, which the app uses to register repos.

After creation, note the **App ID** shown on the app settings page.

> **Local dev note:** GitHub cannot reach `localhost:8080` for webhooks. Use [ngrok](https://ngrok.com) or similar: `ngrok http 8080`, then set the Webhook URL to the ngrok HTTPS URL.

## 2. Generate Private Key

On the app settings page → **Private keys** → **Generate a private key**.

Downloads a `.pem` file. Keep it — you need it for the env var.

## 3. Install the App

On the app settings page → **Install App** → select your account → choose which repos to grant access to.

After install, GitHub redirects back to `http://localhost:5173?installation_id=<id>&setup_action=install`. The app detects this and calls the server to register the repos in PostgreSQL.

## 4. Set Environment Variables

Required at server startup:

```bash
export DATABASE_URL="postgres://user:pass@localhost/ameliso"
export GITHUB_APP_ID="<numeric app id>"
export GITHUB_APP_PRIVATE_KEY="$(cat /path/to/your-app.private-key.pem)"
export GITHUB_WEBHOOK_SECRET="<the secret you set in step 1>"
```

Optional:

```bash
# Override gRPC port (default: 50052)
export AMELISO_PORT=50052

# Override webhook HTTP port (default: 8080)
export AMELISO_WEBHOOK_PORT=8080

# Override the install URL shown in the UI
export GITHUB_APP_INSTALLATION_URL="https://github.com/apps/ameliso-dev/installations/new"
```

If `GITHUB_APP_INSTALLATION_URL` is omitted, defaults to `https://github.com/apps/<GITHUB_APP_NAME>/installations/new` (or `ameliso` if `GITHUB_APP_NAME` is also unset).

Put these in a `.env` file at the repo root or `server/.env` (not committed):

```bash
# .env
DATABASE_URL=postgres://user:pass@localhost/ameliso
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-random-secret
```

## 5. Run the Server

```bash
cd server && cargo run
```

Two listeners start:

| Port  | Protocol | Purpose              |
| ----- | -------- | -------------------- |
| 50052 | gRPC-web | Web/CLI/MCP clients  |
| 8080  | HTTP     | GitHub push webhooks |

Server exits immediately if `DATABASE_URL`, `GITHUB_APP_ID`, or `GITHUB_APP_PRIVATE_KEY` are missing.

## 6. Connect a Repository

Once the server is running:

1. Open `http://localhost:5173` → **Repositories** tab
2. Click **Connect** — opens the GitHub App install page
3. Select repos to grant access to and confirm
4. GitHub redirects back; the app registers the repos in PostgreSQL

The server:
1. Generates JWT from App ID + private key (`server/src/github.rs`)
2. Exchanges it for an installation access token via GitHub API
3. Lists accessible repos and stores metadata in PostgreSQL

## 7. Auto-Sync Behaviour

After setup, Ameliso keeps PostgreSQL and GitHub in sync automatically:

**Write path (PostgreSQL → GitHub)**

Every `CreateCase`, `UpdateCase`, or `DeleteCase` gRPC call spawns a background task that pushes the change to `cases/<path>.md` in the repo via the GitHub Contents API. Failures are logged but never surface to the caller.

**Ingest path (GitHub → PostgreSQL)**

When anyone pushes directly to the repo, GitHub sends a `push` event to `POST /webhook/github`. The server:
1. Verifies the `X-Hub-Signature-256` HMAC header (requires `GITHUB_WEBHOOK_SECRET`)
2. Identifies changed/added/removed `cases/**/*.md` files
3. Fetches content from GitHub and upserts or deletes cases in PostgreSQL

> If `GITHUB_WEBHOOK_SECRET` is not set, signature verification is skipped (not recommended for production).

**Conflict resolution**

PostgreSQL is authoritative. On a 409 (stale SHA) from GitHub, the server fetches the current SHA and retries once. Direct git edits are ingested via webhook and overwrite PostgreSQL state.
