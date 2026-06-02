# Prompt: Debugging

> Use when something is broken and you need to find the root cause.

---

You are debugging a production issue in the **KEYONE** WhatsApp SaaS.

## Context

Read first:
- `/project-knowledge/AI_AGENT_RULES.md`
- `/project-knowledge/TROUBLESHOOTING.md`
- `/project-knowledge/KNOWN_ISSUES.md`

## Approach

1. **Reproduce.** Get the symptom in a controlled way (dashboard, real WhatsApp, dev playground).
2. **Locate the right hot path.** Use `/project-knowledge/HOT_PATHS.md` to find which file is involved.
3. **Read the actual code.** Don't guess at function behavior — open the file.
4. **Check for known regressions.** Look in `/project-knowledge/REGRESSION_RISKS.md` and `/project-knowledge/KNOWN_ISSUES.md`.
5. **Look at logs and audit.**
   - `mse-saas.err.log`, `mse-wa.err.log`, `mse-llm.err.log`
   - `SELECT * FROM SafetyAudit ORDER BY createdAt DESC LIMIT 20`
   - `SELECT * FROM MetricEvent WHERE day=date('now') ORDER BY count DESC`
6. **Confirm the cause** by adding a temporary `console.warn` (NOT permanent — remove after confirming).
7. **Propose minimal fix.** State the exact change in 3 bullets before editing.
8. **Verify** by re-reproducing.

## Rules

- **DO NOT** "fix" symptoms. Find the root cause.
- **DO NOT** add try/catch to hide the error. Add an audit row instead.
- **DO NOT** edit Tier-1 files (see `CRITICAL_FILES.md`) without explicit user approval.
- **DO NOT** push your fix to production until the user approves AND a test plan is agreed.

## Output format

When done debugging, respond with:

```
## Root cause
<one paragraph describing the cause, citing file:line>

## Reproduction
<steps to trigger the bug>

## Proposed fix
<bullets describing the minimal change>

## Test plan
<how to verify the fix works>

## Risk
<what could go wrong with this fix; check REGRESSION_RISKS.md>
```

---

What is the symptom you're seeing?
