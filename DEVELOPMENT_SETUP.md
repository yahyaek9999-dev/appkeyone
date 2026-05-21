# KEYONE — Development Setup Guide

> **Audience:** Any developer setting up the KEYONE codebase on a new or fresh machine.  
> **Last updated:** See git log for this file.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [SSH Key Setup](#2-ssh-key-setup)
3. [Clone the Repository](#3-clone-the-repository)
4. [Install Dependencies](#4-install-dependencies)
5. [Prisma / Database Setup](#5-prisma--database-setup)
6. [Environment Variables](#6-environment-variables)
7. [Running Locally](#7-running-locally)
8. [Type Checking & Build Verification](#8-type-checking--build-verification)
9. [WhatsApp Service (Optional)](#9-whatsapp-service-optional)
10. [Branch Workflow Reminder](#10-branch-workflow-reminder)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

Install the following tools before starting:

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| **Node.js** | 20.x LTS | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schnaibmann/fnm) to manage versions |
| **npm** | 10.x (ships with Node 20) | Do **not** use Yarn or pnpm — lockfile is npm |
| **Git** | 2.40+ | Needed for SSH-based cloning |
| **OpenSSH** | Any modern version | macOS/Linux: built-in. Windows: Git Bash or WSL |

### Verify your environment

```bash
node -v       # should print v20.x.x or higher
npm -v        # should print 10.x.x or higher
git --version # should print 2.40.x or higher
```

> **Windows users:** All commands in this guide should be run in **Git Bash** or **WSL2**, not PowerShell or CMD, unless stated otherwise.

---

## 2. SSH Key Setup

KEYONE uses SSH-based authentication to GitHub. You need a dedicated key for this.

### 2a. Generate your GitHub SSH key

```bash
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/id_ed25519_github
```

- When prompted for a passphrase, choose a strong one (recommended) or leave blank.
- This creates two files:
  - `~/.ssh/id_ed25519_github` — **private key** (never share this)
  - `~/.ssh/id_ed25519_github.pub` — **public key** (add to GitHub)

### 2b. Add the public key to GitHub

```bash
cat ~/.ssh/id_ed25519_github.pub
```

Copy the output, then:

1. Go to **GitHub → Settings → SSH and GPG keys → New SSH key**
2. Title: `My Dev Machine` (or anything descriptive)
3. Key type: **Authentication Key**
4. Paste the public key → **Add SSH key**

### 2c. Configure `~/.ssh/config`

Open (or create) `~/.ssh/config` and add:

```
# GitHub — KEYONE project
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    AddKeysToAgent yes

# KEYONE VPS (production — admin use only)
Host keyone-vps
    HostName 217.154.163.16
    User Administrator
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Fix permissions (required):

```bash
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/id_ed25519_github
```

### 2d. Test the GitHub connection

```bash
ssh -T git@github.com
```

You should see:

```
Hi yahyaek9999-dev! You've successfully authenticated, but GitHub does not provide shell access.
```

If you see a `Permission denied` error, re-check that the public key was added to GitHub and that your `~/.ssh/config` is correct.

---

## 3. Clone the Repository

```bash
git clone git@github.com:yahyaek9999-dev/appkeyone.git
cd appkeyone
```

### Switch to the development branch immediately

```bash
git checkout dev
```

> ⚠️ **Never work directly on `main`.** The `main` branch is production-only. See [Branch Workflow Reminder](#10-branch-workflow-reminder) and `SAFE_GIT_WORKFLOW.md` for full details.

### Confirm your active branch

```bash
git branch
# * dev
#   main
```

---

## 4. Install Dependencies

The main application lives in the `saas/` directory.

```bash
cd saas
npm install
```

This will:
- Install all Node.js dependencies from `package-lock.json`
- Automatically run `prisma generate` via the `postinstall` hook

> The `postinstall` script runs `prisma generate` automatically. You do not need to run it manually after `npm install`. However, if you update `prisma/schema.prisma`, you must regenerate (see [Section 5](#5-prisma--database-setup)).

---

## 5. Prisma / Database Setup

KEYONE uses **Prisma ORM** with a **SQLite** database for local development and production.

### 5a. Generate the Prisma Client

If you didn't run `npm install` yet, or you modified the schema:

```bash
cd saas
npx prisma generate
```

### 5b. Push the schema to create/migrate the local database

```bash
npx prisma db push
```

This creates `saas/prisma/dev.db` (the local SQLite file) and applies the current schema.

> **Do not commit `dev.db`** — it is listed in `.gitignore`.

### 5c. (Optional) Inspect the database visually

```bash
npx prisma studio
```

Opens a browser-based UI at `http://localhost:5555` for browsing and editing records.

### 5d. Schema location

The canonical Prisma schema is at:

```
saas/prisma/schema.prisma
```

There is also a `schema.postgres.prisma` in the same directory — this is for future PostgreSQL migration planning; do not use it for local dev.

---

## 6. Environment Variables

The app reads configuration from `saas/.env.local` (local dev) or `saas/.env` (production). Neither file is committed to git — **you must create it yourself**.

### 6a. Create your local env file

```bash
cp deploy/env.saas.example saas/.env.local
```

Then open `saas/.env.local` and fill in the required values.

### 6b. Required variables

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | Path to SQLite DB file | `file:./prisma/dev.db` for local |
| `AUTH_SECRET` | NextAuth session secret (64-char hex) | Generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the app | `http://localhost:3000` for local dev |
| `LLM_API_URL` | URL of the LLM/AI backend | Ask admin or use `http://127.0.0.1:7788` |
| `LLM_API_KEY` | API key for the LLM backend | Ask admin |
| `LLM_MODEL` | Model name (e.g. `gpt-4o-mini`) | `gpt-4o-mini` |
| `WHATSAPP_SERVICE_URL` | URL of the WhatsApp service | `http://127.0.0.1:7799` (if running locally) |
| `WHATSAPP_SHARED_SECRET` | Shared secret for WA service auth | Ask admin |
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP port | `3000` |

### 6c. Minimal local `.env.local` example

```ini
# saas/.env.local — LOCAL DEVELOPMENT ONLY — never commit this file

NEXT_PUBLIC_SITE_URL="http://localhost:3000"
DATABASE_URL="file:./prisma/dev.db"
AUTH_SECRET="replace-with-output-of-openssl-rand-hex-32"

# LLM backend — ask admin for production values, or point to local instance
LLM_API_URL="http://127.0.0.1:7788"
LLM_API_KEY="your-local-or-dev-key"
LLM_MODEL="gpt-4o-mini"

# WhatsApp service — leave blank if not running locally
WHATSAPP_SERVICE_URL="http://127.0.0.1:7799"
WHATSAPP_SHARED_SECRET="your-local-shared-secret"

# Baileys experimental provider — keep disabled in dev unless testing
ENABLE_BAILEYS="0"

NODE_ENV="development"
PORT="3000"
```

### 6d. Getting production values

> ⚠️ **Never copy production secrets into a file that could be committed.**

If you need production environment values for debugging:
- SSH into the VPS (see `VPS_DEPLOY_WORKFLOW.md`) and read `C:\app\saas\.env`
- Or ask the project administrator directly

Generate a fresh `AUTH_SECRET`:

```bash
openssl rand -hex 32
```

---

## 7. Running Locally

From the `saas/` directory:

```bash
npm run dev
```

The app starts at **[http://localhost:3000](http://localhost:3000)**.

Next.js will hot-reload on file changes. You do **not** need to restart the server for most code changes.

### Available npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server (port 3000, hot reload) |
| `npm run build` | Production build (runs `prisma generate` + `next build`) |
| `npm run start` | Start production server (requires a prior `build`) |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Sync Prisma schema to local SQLite |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run verify:all` | Run all verification suites |
| `npm run worker:baileys` | Start the Baileys WhatsApp worker (experimental) |

---

## 8. Type Checking & Build Verification

Before committing or opening a PR, always verify TypeScript compiles cleanly.

### Type check (no output files)

```bash
cd saas
npx tsc --noEmit
```

Or, if a `typecheck` script is defined:

```bash
npm run typecheck
```

A clean output (no errors printed) means you're good. Any errors must be resolved before merging.

### Full build test

```bash
npm run build
```

This runs `prisma generate` then `next build`. A successful build produces a `.next/` output directory. If this fails locally, it **will** fail on the VPS deploy — fix it before pushing.

> **Tip:** Run `npm run build` locally before every push to `main`. It catches import errors, missing env vars (that are referenced in code), and invalid TypeScript that hot-reload silently ignores.

---

## 9. WhatsApp Service (Optional)

The WhatsApp bridge lives in `whatsapp-service/`. You only need to run this if you're working on WhatsApp-related features.

```bash
cd whatsapp-service
npm install
```

Create its env file:

```bash
cp deploy/env.whatsapp.example whatsapp-service/.env
# edit whatsapp-service/.env with local values
```

Start the service:

```bash
node src/index.js
```

The service runs on port **7799** by default and the main `saas/` app connects to it via `WHATSAPP_SERVICE_URL`.

> Sessions are stored in `whatsapp-service/sessions/` — this directory is git-ignored. Never commit session data.

---

## 10. Branch Workflow Reminder

| Branch | Purpose | Rules |
|--------|---------|-------|
| `main` | Production | **Never commit directly.** Deploy-only target. |
| `dev` | Active development | Default branch for all new work |
| `ai-experimental` | AI/LLM experiments | High-risk changes only |
| `baileys-exp` | Experimental WhatsApp runtime | Baileys testing only |

**Always:**
```bash
git checkout dev
git pull origin dev   # sync before starting new work
```

**Never:**
```bash
git push origin main          # only merge via PR after testing on dev
git commit -m "..." --amend   # don't rewrite shared history
```

See `SAFE_GIT_WORKFLOW.md` for the complete branching guide.

---

## 11. Troubleshooting

### `prisma generate` fails with "schema not found"

Make sure you're running commands from inside the `saas/` directory:

```bash
cd saas
npx prisma generate
```

### `npm install` fails with EACCES errors (Linux/macOS)

Never use `sudo npm install`. Fix npm permissions instead:

```bash
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Port 3000 is already in use

```bash
# Find the process using port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

Or change the port temporarily:

```bash
PORT=3001 npm run dev
```

### `AUTH_SECRET` error on startup

Generate a new secret and add it to your `.env.local`:

```bash
openssl rand -hex 32
```

### SSH: `git clone` hangs or times out

- Confirm `~/.ssh/config` has the correct `IdentityFile` path
- Test connectivity: `ssh -T git@github.com`
- Ensure the `id_ed25519_github.pub` is added to GitHub

### "Module not found" after pulling new changes

Dependencies changed — re-run:

```bash
cd saas
npm install
```

### Prisma Client is out of sync

After any schema change (yours or a team member's):

```bash
cd saas
npx prisma db push
npx prisma generate
```

---

> **Questions?** Check `SAFE_GIT_WORKFLOW.md` for branching rules, `VPS_DEPLOY_WORKFLOW.md` for production deploy, or contact the project administrator.
