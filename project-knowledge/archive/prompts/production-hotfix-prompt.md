# Prompt: Production Hotfix

> Use when production is broken NOW and a fast fix is required.

---

⚠️ **Production is broken. Speed matters, but discipline matters more.**

## Triage (first 5 minutes)

1. **What's broken?** Get a one-sentence symptom from the user. Examples:
   - "All merchants' bots are silent"
   - "Broadcasts duplicate sends"
   - "Admin panel returns 500"

2. **Determine severity:**
   - **P0** (all merchants affected) → consider immediate rollback to last known good
   - **P1** (one merchant or one feature) → fix-forward acceptable

3. **Check service health:**
   ```bash
   ssh administrator@217.154.163.16 'powershell -Command "Get-Service mse-* | Select Name, Status"'
   ```

4. **Tail logs:**
   ```bash
   ssh ... 'powershell -Command "Get-Content C:\app\logs\mse-saas.err.log -Tail 50"'
   ssh ... 'powershell -Command "Get-Content C:\app\logs\mse-wa.err.log -Tail 50"'
   ```

## Decision: rollback or fix forward?

| Symptom | Action |
|---|---|
| Started right after last deploy | **Rollback first**, debug after |
| Pre-existing or unrelated to deploy | Fix forward |
| Unknown cause, all merchants affected | **Rollback first**, debug after |
| One specific merchant only | Fix forward |
| Schema drift (P2021) | Run `prisma db push` + restart |
| `mse-llm` dead | RDP + relog into chatgpt.com + restart service |

## Rollback (fastest path to green)

```bash
ssh administrator@217.154.163.16 'powershell -NoProfile -File C:\app\deploy\rollback.ps1'
```

Verify:
```bash
ssh ... 'powershell -Command "(Invoke-WebRequest http://localhost:3000/login).StatusCode"'  # expect 200
```

After successful rollback:
- Investigate root cause in calm mode
- Write findings to `/project-knowledge/INCIDENT_RESPONSE.md`
- File a follow-up to fix the underlying issue properly

## Fix forward (when rollback won't help)

Follow the `safe-fix-prompt.md` workflow but **expedited**:
1. Quick root-cause identification
2. **Minimal** change (1-3 lines if possible)
3. State the diff in chat
4. User approves
5. Deploy

Use this expedited deploy:
```bash
# Skip backup ONLY if you've already taken one in the last 30 min and you're fix-forwarding
scp -q <file> administrator@217.154.163.16:'C:/app/<remote>'
ssh ... 'powershell -NoProfile -File C:\app\deploy\deploy.ps1'   # NO -SkipBackup; let it backup again
```

## Communication

After resolution, write a brief postmortem:

```markdown
## YYYY-MM-DD HH:MM UTC — <short title>
**Severity:** P0 | P1
**Duration:** XX min
**Impact:** <how many merchants / customers affected>
**Symptom:** <what users saw>
**Root cause:** <one paragraph, file:line>
**Fix:** rollback | hotfix
**Prevention:** <bullet list of changes to avoid recurrence>
```

Append to `/project-knowledge/INCIDENT_RESPONSE.md`.

## Hard rules during a hotfix

- **DO NOT** edit Tier-1 files without explicit approval, even under pressure.
- **DO NOT** add `-SkipBackup` to make deploy faster — backup is the safety net for the next time things break.
- **DO NOT** disable kill switches, anti-ban, or audit logging "just to make it work."
- **DO NOT** push a fix you haven't read end-to-end. A bad hotfix becomes a P0 itself.
- **DO** rollback if uncertain.

## After resolution (within 24 hours)

1. Write a postmortem (see above)
2. Add to `/project-knowledge/REGRESSION_RISKS.md` if the bug is the type that could recur
3. Update `/project-knowledge/KNOWN_ISSUES.md` if a workaround remains
4. Update `/project-knowledge/TROUBLESHOOTING.md` if the symptom-to-cause mapping is new

---

What's broken?
