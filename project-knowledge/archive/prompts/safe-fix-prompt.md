# Prompt: Safe Fix (Production)

> Use when you have a confirmed bug and need to ship a fix safely.

---

You have a confirmed bug to fix in **KEYONE** production.

## Pre-flight

Open these in order:
1. `/project-knowledge/AI_AGENT_RULES.md`
2. `/project-knowledge/CRITICAL_FILES.md` (find your file's tier)
3. `/project-knowledge/REGRESSION_RISKS.md` (check related risks)
4. The matching flow in `/project-knowledge/flows/`
5. The matching subsystem doc

## Constraints

- Make the **smallest possible** change.
- Preserve all existing comments.
- Add comments around your edit explaining **why** (not what).
- If the change is on a Tier-1 file, write the plan in chat BEFORE editing.

## Workflow

1. **Read the file end-to-end** (not just the area you're editing).
2. **State the plan:**
   ```
   ## Plan
   - file: <path>
   - change: <one sentence>
   - rationale: <why>
   - risk: <reference to REGRESSION_RISKS.md entry or "new"; the failure mode if your fix is wrong>
   ```
3. **Wait for approval** if the user hasn't pre-approved.
4. **Make the edit** via `edit` or `multi_edit` (NOT `write_to_file` on existing files).
5. **Type-check:** `npx tsc --noEmit -p .` from `saas/`.
6. **Self-review the diff:**
   - Did you keep all comments?
   - Did you minimize the change?
   - Did you add try/catch + audit logging on new failure paths?
   - Did you add a `bump("...")` metric if appropriate?

## Deploy

Provide the user with a copy-paste deploy:

```bash
# 1. Upload changed files
scp -q <relative_path> administrator@217.154.163.16:'C:/app/<relative_path>'

# 2. Type-check on VPS (optional but recommended)
ssh administrator@217.154.163.16 'powershell -Command "Set-Location C:\app\saas; node node_modules\typescript\bin\tsc --noEmit -p . 2>&1 | Select -Last 5"'

# 3. Build + restart
ssh administrator@217.154.163.16 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\app\deploy\deploy.ps1'

# 4. Smoke test
ssh administrator@217.154.163.16 'powershell -Command "(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode"'
# expect 200
```

## Update docs

After the fix is deployed and verified:
- Append entry to `/project-knowledge/REGRESSION_RISKS.md`
- If it's a known issue, move it to "Resolved" in `/project-knowledge/KNOWN_ISSUES.md`
- Add a deploy log line in `/project-knowledge/INCIDENT_RESPONSE.md`

## Hard rules

- **DO NOT** deploy without the user's explicit approval of the diff.
- **DO NOT** edit files outside the scope you proposed.
- **DO NOT** skip the backup stage of `deploy.ps1` (no `-SkipBackup`).
- **DO NOT** add new dependencies for a single fix.

---

What's the bug?
