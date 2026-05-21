# KEYONE — Safe Git Workflow

> **Audience:** All developers contributing to the KEYONE project.  
> **Rule #1:** `main` is production. Treat every push to `main` as a live deployment.  
> **Last updated:** See git log for this file.

---

## Table of Contents

1. [Branch Structure](#1-branch-structure)
2. [Day-to-Day Development Workflow](#2-day-to-day-development-workflow)
3. [Merging to Production](#3-merging-to-production)
4. [Commit Message Convention](#4-commit-message-convention)
5. [Multi-Device Safety](#5-multi-device-safety)
6. [Secret & Sensitive File Rules](#6-secret--sensitive-file-rules)
7. [Rollback Procedures](#7-rollback-procedures)
8. [Emergency Recovery on VPS](#8-emergency-recovery-on-vps)
9. [What is Forbidden](#9-what-is-forbidden)
10. [Quick Reference Card](#10-quick-reference-card)

---

## 1. Branch Structure

```
main  ──────────────────────────────────────────► production
        ▲               ▲
        │ merge (PR)    │ merge (PR)
dev  ───┴───────────────┴──────────────────────► integration
        ▲       ▲       ▲
        │       │       │
   feature/  fix/   chore/          (short-lived, deleted after merge)
   my-thing  bug-x  cleanup


ai-experimental  ──────────────────────────────► AI/LLM experiments only
                                                  (never merged to main directly)

baileys-exp  ───────────────────────────────────► Baileys WA runtime tests only
                                                  (never merged to main directly)
```

### Branch definitions

| Branch | Purpose | Lifetime | Merges into |
|--------|---------|----------|-------------|
| `main` | **Production.** What runs on the VPS right now. | Permanent | — (deploy target) |
| `dev` | **Integration.** All development work lands here first. | Permanent | `main` (when ready) |
| `feature/*` | Individual feature or improvement | Short-lived | `dev` |
| `fix/*` | Bug fix | Short-lived | `dev` |
| `chore/*` | Refactor, tooling, docs | Short-lived | `dev` |
| `ai-experimental` | AI/LLM provider experiments, prompt engineering, risky AI integrations | Long-lived | `dev` only, carefully |
| `baileys-exp` | Experimental Baileys WhatsApp runtime. Isolated from production routing. | Long-lived | `dev` only, carefully |

### Branch rules at a glance

- **`main`**: No direct commits. No force pushes. Merges from `dev` only.
- **`dev`**: Default starting point for all new work. Must stay stable enough to demo.
- **`ai-experimental` / `baileys-exp`**: High-risk sandboxes. Code here may be broken. Review carefully before merging upstream.

---

## 2. Day-to-Day Development Workflow

### Step 1: Always start from an up-to-date `dev`

```bash
git checkout dev
git pull origin dev
```

Never start new work from a stale branch. Always pull first.

### Step 2: Create a feature branch from `dev`

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
# or
git checkout -b chore/what-you-are-doing
```

Name branches descriptively. Use lowercase and hyphens. Examples:
- `feature/whatsapp-bulk-send`
- `fix/login-redirect-loop`
- `chore/upgrade-prisma-5`

### Step 3: Work locally and commit incrementally

```bash
# Make changes...
git add -A
git commit -m "feat(whatsapp): add bulk send queue with rate limiting"

# More changes...
git add -A
git commit -m "test(whatsapp): add unit tests for bulk send dedup logic"
```

See [Section 4](#4-commit-message-convention) for commit message format.

### Step 4: Push your branch to GitHub

```bash
git push origin feature/your-feature-name
```

If this is your first push of this branch:

```bash
git push -u origin feature/your-feature-name
```

### Step 5: Open a Pull Request to `dev`

1. Go to GitHub → Pull Requests → New pull request
2. **Base:** `dev` ← **Compare:** `feature/your-feature-name`
3. Write a clear title and description
4. Request review if team size warrants it
5. Merge when approved (or self-merge if working solo)

### Step 6: Test on `dev`

After merging to `dev`, verify locally:

```bash
git checkout dev
git pull origin dev
cd saas
npm install        # pick up any new deps
npm run build      # verify the build still passes
npm run dev        # smoke test in the browser
```

### Step 7: Clean up the feature branch

```bash
# Delete locally
git branch -d feature/your-feature-name

# Delete on GitHub
git push origin --delete feature/your-feature-name
```

---

## 3. Merging to Production

Only merge `dev` into `main` when:

- [ ] All features for this release are complete and tested on `dev`
- [ ] `npm run build` passes on `dev` locally
- [ ] `npx tsc --noEmit` produces no errors
- [ ] No known breaking bugs
- [ ] You are ready to immediately deploy (don't merge to `main` and leave it undeployed)

### Merge dev → main

```bash
git checkout main
git pull origin main          # ensure main is up to date
git merge --no-ff dev         # --no-ff preserves merge history
git push origin main
```

The `--no-ff` flag creates a merge commit even if a fast-forward is possible. This makes the history readable — you can always see what was a deliberate "release" merge.

### Immediately deploy after merging to main

Once you push to `main`, the VPS deploy should follow. Do not leave `main` ahead of production for long periods. See `VPS_DEPLOY_WORKFLOW.md`.

---

## 4. Commit Message Convention

KEYONE uses a simplified [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `chore` | Maintenance, refactor, tooling, deps |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code restructure, no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `revert` | Reverting a previous commit |
| `deploy` | Deploy-related scripts or config only |

### Scopes (optional but helpful)

`saas`, `whatsapp`, `prisma`, `auth`, `api`, `dashboard`, `cron`, `baileys`, `deploy`, `docs`

### Good commit message examples

```
feat(whatsapp): add retry logic for failed message sends
fix(auth): correct redirect loop after password reset
chore(deps): upgrade next from 14.2.15 to 14.2.18
docs: add VPS deploy workflow documentation
fix(prisma): correct schema migration for FollowUpTask table
perf(api): cache conversation list query results in Redis
revert: feat(baileys): experimental session persistence
deploy: update deploy.ps1 health check retry count to 6
```

### Bad commit messages (avoid these)

```
fix stuff
WIP
changes
update
asdf
fix bug
```

### Body and footer (use for non-trivial changes)

```
feat(cron): add daily report email delivery

Sends a HTML summary email to tenant admins each morning at 08:00.
Uses the existing LLM pipeline to generate the subject line.

Closes #42
Breaking-change: requires SMTP_HOST env var
```

---

## 5. Multi-Device Safety

If you work across multiple machines (desktop, laptop, VPS direct editing), follow these rules to avoid diverged branches and lost work.

### Golden rule: always pull before you work

```bash
# Every single time you sit down to work
git checkout dev
git pull origin dev
```

### Before switching devices mid-feature

```bash
# On machine A — push your WIP
git add -A
git commit -m "chore: WIP — saving progress before switching device"
git push origin feature/your-feature-name

# On machine B — pick up where you left off
git fetch origin
git checkout feature/your-feature-name
git pull origin feature/your-feature-name
```

### If you accidentally diverged

```bash
# Check what diverged
git status
git log --oneline --graph origin/dev..HEAD

# Safe option: rebase onto current dev
git fetch origin
git rebase origin/dev

# If rebase has conflicts, resolve them, then:
git add -A
git rebase --continue
```

### Never edit files directly on the VPS

The VPS is **production only**. Direct edits to `C:\app\` outside of the deploy process:
- Won't be in git history
- Will be overwritten on the next `git reset --hard` during deploy
- Can introduce untested changes into production silently

All changes go through: `local dev → GitHub → VPS deploy`.

---

## 6. Secret & Sensitive File Rules

### Files that must NEVER be committed

The `.gitignore` enforces most of these, but stay vigilant:

| File/Pattern | Why it's forbidden |
|-------------|-------------------|
| `.env`, `.env.local`, `.env.production` | Contains database URLs, API keys, secrets |
| `.env.development`, `.env.staging` | May contain real credentials |
| `.deployment-secrets.txt` | Explicit secrets file |
| `*.secrets.txt`, `*.credentials.txt` | Any secrets file |
| `*.db`, `*.sqlite`, `*.sqlite3` | Database files (contain user data) |
| `*.db-wal`, `*.db-shm` | SQLite write-ahead log files |
| `sessions/` | WhatsApp authentication sessions |
| `backups/` | DB snapshots (contain user data) |
| `*.token`, `*.key` | Auth tokens and private keys |

### How to verify you haven't staged anything sensitive

```bash
git status           # review everything before committing
git diff --staged    # read the exact diff before committing
```

### What to do if you accidentally committed a secret

1. **Do not push.** If you haven't pushed yet:
   ```bash
   git reset HEAD~1         # undo the commit, keep changes staged
   # remove the secret from the file
   git add -A
   git commit -m "chore: ..."
   ```

2. **If you already pushed:** The secret is now public history and must be treated as compromised.
   - Rotate the credential immediately (change the password/key/token at the source)
   - Contact the project administrator
   - Use `git filter-repo` or GitHub's secret scanning remediation tools to purge the history

### Checking what `.gitignore` protects

```bash
git check-ignore -v path/to/suspicious/file
```

---

## 7. Rollback Procedures

### Rollback a commit that was NOT yet deployed to production

```bash
# Undo last commit (keep changes in working tree)
git reset HEAD~1

# Undo last commit (discard all changes) — use carefully
git reset --hard HEAD~1
```

> `git reset --hard` is safe on your **local, unpushed** work. It is **not safe** on shared branches or on the VPS.

### Rollback a commit that WAS merged to dev (not yet on main)

```bash
git checkout dev
git pull origin dev

# Find the commit to revert
git log --oneline -10

# Revert it (creates a new commit — safe for shared branches)
git revert <COMMIT_HASH>
git push origin dev
```

### Rollback a commit that was deployed to production (on main)

**Never use `git reset --hard` on `main`.** Use `git revert` instead:

```bash
git checkout main
git pull origin main

# Revert the bad commit
git revert HEAD             # revert last commit
# or
git revert <COMMIT_HASH>    # revert specific commit

git push origin main

# Then immediately re-deploy
```

`git revert` is safe because it adds a new commit that reverses the changes. The history is preserved, and collaborators can pull cleanly.

### Full production rollback (code + database)

When a deploy breaks the running application and needs a full restore:

```bash
# On VPS via PowerShell
cd C:\app\deploy
.\rollback.ps1
```

See `VPS_DEPLOY_WORKFLOW.md` Section 7 for the complete rollback reference.

---

## 8. Emergency Recovery on VPS

Use these commands when the VPS is in a bad state and you need to diagnose or recover quickly.

### Find the last 10 commits on VPS

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git --no-pager log --oneline -10\""
```

Example output:
```
a3f9c12 feat(cron): add daily report delivery
b8e1d45 fix(auth): correct token expiry handling
c7d2f89 chore(deps): upgrade @prisma/client to 5.22
...
```

### Revert VPS to a previous commit (emergency only)

```bash
# Step 1: Run a backup first
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"cd C:\\app\\deploy; .\\backup-all.ps1\""

# Step 2: Reset to a specific commit hash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git reset --hard b8e1d45\""

# Step 3: Rebuild
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app\\saas; npx prisma generate; npm run build\""

# Step 4: Restart service
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"nssm restart mse-saas\""

# Step 5: Health check
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Start-Sleep 15; Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/api/health -TimeoutSec 20 | Select-Object -ExpandProperty Content\""
```

> Replace `b8e1d45` with the actual commit hash you want to restore. Never guess.

### Check what branch and commit the VPS is on

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git rev-parse --abbrev-ref HEAD; git rev-parse HEAD\""
```

### Check if VPS has uncommitted changes

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git status --short\""
```

A clean production VPS should show no output. Any uncommitted changes on the VPS are a red flag — they will be lost on the next `git reset --hard`.

---

## 9. What is Forbidden

These actions are banned at all times, on all branches, for all contributors:

| Action | Why |
|--------|-----|
| `git push --force origin main` | Rewrites shared history; breaks everyone's local copies and deploy audit trail |
| `git push --force-with-lease origin main` | Same risk; not significantly safer for a shared production branch |
| `git reset --hard` on `main` locally, then push | Equivalent to force push in effect |
| Committing `.env` or any secret file | Exposes credentials permanently (git history is forever) |
| Direct commits to `main` | Bypasses testing on `dev`; undocumented production changes |
| Editing files directly on VPS outside the deploy process | Changes are untracked, will be lost on next deploy |
| `git reset --hard` on VPS without a prior backup | Can permanently destroy production database or env files |
| Committing `sessions/`, `backups/`, or `*.db` | Contains user data, auth tokens; must never be in a repo |
| Merging `ai-experimental` or `baileys-exp` directly to `main` | These branches are sandboxes; must go through `dev` and be thoroughly reviewed first |

---

## 10. Quick Reference Card

### Starting new work

```bash
git checkout dev && git pull origin dev
git checkout -b feature/my-thing
```

### Saving work in progress

```bash
git add -A
git commit -m "feat(scope): short description"
git push origin feature/my-thing
```

### Merging to dev

```bash
git checkout dev && git pull origin dev
git merge --no-ff feature/my-thing
git push origin dev
git branch -d feature/my-thing
git push origin --delete feature/my-thing
```

### Releasing to production

```bash
git checkout main && git pull origin main
git merge --no-ff dev
git push origin main
# → then run deploy.ps1 on VPS
```

### Safe rollback (code only, no DB)

```bash
git revert HEAD
git push origin main
# → then re-deploy
```

### Full production rollback (code + DB)

```powershell
# On VPS
cd C:\app\deploy
.\rollback.ps1
```

### Things that should never happen

```bash
# NEVER:
git push --force origin main
git commit -m "add secrets" .env
git reset --hard main   # on VPS
```

---

> **Related docs:** `DEVELOPMENT_SETUP.md` for local environment setup · `VPS_DEPLOY_WORKFLOW.md` for production deploy procedures
