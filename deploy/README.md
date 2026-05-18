# KEYONE — Windows VPS Deployment Guide

End-to-end deployment of the KEYONE WhatsApp Bot SaaS on a Windows Server VPS
(no Docker, native services).

## Architecture on the VPS

```
Internet ── 443/80 ──> Caddy ──> 127.0.0.1:3000   Next.js SaaS
                            ──> 127.0.0.1:7788   FastAPI CloakBrowser (/llm/*)
                            ──> 127.0.0.1:7799   WhatsApp service     (/wa/*)
```

All four processes run as **Windows services** via NSSM and auto-restart on crash.

## Prerequisites

* Windows Server 2019/2022 VPS (or Windows 10/11 with admin access).
* A public **IPv4** (e.g. `217.154.163.16`).
* DNS records pointing at the VPS:
  * `k1wb.app.keyone1.com  A  <VPS_IPV4>`
* Ports **80** and **443** open in the cloud firewall (IONOS / Azure / AWS console).

## Step-by-step

### 1. Bootstrap the VPS

Open **PowerShell as Administrator** and run:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
iwr https://raw.githubusercontent.com/YOUR_GITHUB/mse_ai_api/main/deploy/setup-vps.ps1 -OutFile setup-vps.ps1
.\setup-vps.ps1 -RepoUrl "https://github.com/YOUR_GITHUB/mse_ai_api.git"
```

This installs Chocolatey, Node 20 LTS, Python 3.12, Git, NSSM, Caddy and
`vcredist`, then clones the repo to `C:\KEYONE\repo` and installs every
dependency.

### 2. Configure the three `.env` files

Copy the templates from `deploy/` into their target locations:

| Service    | Source                          | Target                                            |
| ---------- | ------------------------------- | ------------------------------------------------- |
| SaaS       | `deploy/env.saas.example`       | `C:\KEYONE\repo\saas\.env`                        |
| LLM API    | `deploy/env.llm.example`        | `C:\KEYONE\repo\.env`                             |
| WhatsApp   | `deploy/env.whatsapp.example`   | `C:\KEYONE\repo\whatsapp-service\.env`            |

Edit each file and replace every value marked `change-...` with a strong
random string. Use the same value for `LLM_API_KEY` (saas) ↔ `API_KEY` (llm),
and the same value for `WHATSAPP_SHARED_SECRET` (saas) ↔ `SHARED_SECRET` (whatsapp).

### 3. Seed the database & build the SaaS

```powershell
cd C:\KEYONE\repo\saas
npx prisma db push
npx tsx prisma\seed.ts
npm run build
```

The seed creates:

* 4 USD-priced plans (Starter $29, Pro $79, Business $149, Enterprise $299).
* A `SiteConfig` singleton with the default brand info.
* A default admin user — credentials are printed at the end of the seed run.

### 4. Register & start the services

```powershell
cd C:\KEYONE\repo\deploy
.\start-services.ps1
```

Verify everything is running:

```powershell
Get-Service KEYONE-*
```

You should see four services in `Running` state. Logs live in `C:\KEYONE\logs\`.

### 5. Verify the domain

Visit `https://k1wb.app.keyone1.com` from any browser. Caddy will request a
Let's Encrypt certificate automatically on the first hit.

* `/`        — public landing page
* `/pricing` — plans
* `/login`   — user login
* `/admin`   — admin dashboard (sign in with the seeded admin account)

## Day-to-day commands

```powershell
# Pull latest code, rebuild, and restart the SaaS + WhatsApp services
cd C:\KEYONE\repo\deploy ; .\update.ps1

# Restart everything (including Caddy + LLM)
.\update.ps1 -RestartAll

# Stop / start / remove
.\start-services.ps1 -Stop
.\start-services.ps1 -Restart
.\start-services.ps1 -Remove
```

## Troubleshooting

| Symptom                          | Fix                                                            |
| -------------------------------- | -------------------------------------------------------------- |
| HTTPS does not work after deploy | Confirm DNS A record points to the VPS, and ports 80/443 open. |
| Caddy can't bind 80/443          | Make sure IIS is **stopped** (`iisreset /stop`) or removed.    |
| LLM service crashes              | Inspect `C:\KEYONE\logs\llm-stderr.log`. Usually Playwright needs `python -m playwright install chromium`. |
| Next.js 500 on /api/chat         | Check `saas\.env` and that `KEYONE-LLM` service is running.    |
| WhatsApp QR not appearing        | Tail `whatsapp-stderr.log`. Often a stale session in `C:\KEYONE\data\wa-sessions`. |

## Hardening checklist

- [ ] Change all `change-...` secrets in every `.env` file.
- [ ] Change the default admin password right after the first login.
- [ ] Set up regular SQLite backups of `C:\KEYONE\data\saas.db`.
- [ ] Enable Windows Update auto-install for security patches.
- [ ] Configure RDP to a non-default port and restrict by IP if possible.
