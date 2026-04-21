# GitHub App Setup (Dev Environment)

## 1. Create GitHub App

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.

| Field                  | Value                       |
| ---------------------- | --------------------------- |
| App name               | `ameliso-dev` (or anything) |
| Homepage URL           | `http://localhost:5173`     |
| Setup URL              | `http://localhost:5173`     |
| Webhook                | Disable (uncheck "Active")  |
| Repository permissions | **Contents**: Read          |
| Where installed        | "Only on this account"      |

The **Setup URL** is critical — GitHub redirects back to it with `?installation_id=<id>&setup_action=install` after install, which the app uses to automatically clone repos.

After creation, note the **App ID** shown on the app settings page.

## 2. Generate Private Key

On the app settings page → **Private keys** → **Generate a private key**.

Downloads a `.pem` file. Keep it — you need it for the env var.

## 3. Install the App

On the app settings page → **Install App** → select your account → choose which repos to grant access to.

After install, GitHub redirects back to `http://localhost:5173?installation_id=<id>&setup_action=install`. The app detects this and automatically calls the server to clone the repos.

## 4. Set Environment Variables

Two vars are required at server startup (`server/src/main.rs:8`):

```bash
export GITHUB_APP_ID="<numeric app id>"
export GITHUB_APP_PRIVATE_KEY="$(cat /path/to/your-app.2024-01-01.private-key.pem)"
```

Optional — override the install URL shown in the UI:

```bash
export GITHUB_APP_INSTALLATION_URL="https://github.com/apps/ameliso-dev/installations/new"
```

If omitted, defaults to `https://github.com/apps/ameliso/installations/new`.

Put these in a local `.env` file (not committed) and source before running:

```bash
# .env.local
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
```

```bash
set -a && source .env.local && set +a
```

## 5. Run the Server

```bash
cd server
cargo run
```

Server listens on `[::1]:50051`. Fails fast if `GITHUB_APP_ID` or `GITHUB_APP_PRIVATE_KEY` are missing.

## 6. Connect a Repository

Once server is running, the client calls `GetGitHubInstallUrl` to get the install URL, then handles the callback with the `installation_id`. The server:

1. Generates JWT from app ID + private key (`server/src/github.rs:33`)
2. Exchanges for installation access token via GitHub API
3. Lists accessible repos and clones them to `~/.ameliso/repos/<owner>/<repo>`
4. Stores metadata in `~/.ameliso/repos.json`

## Data Locations

| Path                              | Contents                |
| --------------------------------- | ----------------------- |
| `~/.ameliso/repos.json`           | Connected repo metadata |
| `~/.ameliso/repos/<owner>/<repo>` | Cloned repo data        |

Override base dir with `AMELISO_DATA_DIR`.
