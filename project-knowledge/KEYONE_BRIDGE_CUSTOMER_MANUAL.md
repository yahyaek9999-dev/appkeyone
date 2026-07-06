# KEYONE Bridge — Customer Manual

**KEYONE Bridge** is a small program you install once on a computer that stays on
(a PC, a Mac, or a server). It connects your WhatsApp to your KEYONE dashboard so
KEYONE can send and receive messages for you. After you install it, **you control
everything from the KEYONE Dashboard** — you almost never need to open the Bridge
program again.

> This is a new feature. If you don't see "KEYONE Bridge" in your dashboard yet,
> ask KEYONE support to enable it for your account.

**What you'll need:** a computer that stays powered on with internet, and your
phone with WhatsApp (to scan a QR code once).

---

## 1. Installation

1. In the KEYONE Dashboard, open **Settings → KEYONE Bridge**, then click
   **"تنزيل Bridge" (Download Bridge)**.
2. The page automatically detects your system and highlights the right download
   ("نظامك" / *your system*). Choose your platform:
   - **Windows** — download the installer (`.msi`) and double-click it.
   - **macOS** — download the installer (`.pkg`) and double-click it.
   - **Linux** — download the `.deb` (Ubuntu/Debian) or the AppImage.
   - **Docker** — copy the `docker run` command shown on the page.
3. Follow the installer. It sets the Bridge up to **start automatically and run in
   the background** — you do not keep a window open.

That's the only time you use the installer.

## 2. Login (one-time, in a terminal)

Linking uses a short one-time code, so this single step happens in a terminal:

1. Open a terminal / command prompt on the computer where you installed Bridge:
   - **Windows:** open **PowerShell**.
   - **macOS:** open **Terminal**.
   - **Linux:** open your terminal.
2. Type this and press Enter:
   ```
   keyone-bridge login
   ```
3. It prints a short **code** (for example `K4P7-9QR2`) and a link. Keep it open.

## 3. First-time setup

The Bridge walks you through it, and the Dashboard shows a **step-by-step wizard**
(*Download → Install → Login → Connect → Scan QR → Done*):

1. **Download & install** (Section 1).
2. **Login** and get your code (Section 2).
3. **Approve the code** in the Dashboard (Section 4).
4. **Start the QR and scan it** with WhatsApp (Section 5).
5. **Done** — from now on you manage everything from the Dashboard.

## 4. Linking (approve your device)

1. In the Dashboard, open **Settings → KEYONE Bridge → "ربط جهاز" (Link device)**.
2. Type the **code** that `keyone-bridge login` showed you (e.g. `K4P7-9QR2`).
3. Click **"اعتماد وربط الجهاز" (Approve & link device)**.
4. Your device now appears in the Dashboard as a Bridge. The code is valid once
   and only for a few minutes — if it expires, just run `keyone-bridge login`
   again.

## 5. QR flow (connect WhatsApp)

1. On your Bridge card in the Dashboard, click **"بدء الربط / عرض QR"
   (Start / show QR)**.
2. A **QR code** appears in the Dashboard with a countdown timer.
3. On your **phone**: open WhatsApp → **Settings → Linked Devices → Link a
   Device**, and **scan the QR** on your screen.
4. When it connects, the card shows **"واتساب متصل" (WhatsApp connected)** with
   your number. You're live.

**If the QR expires** (the countdown reaches zero): click **"تحديث الرمز"
(Refresh QR)** to get a new one, then scan again.

## 6. Updating

- The Dashboard shows your **current version** and the **latest version**. When a
  newer version is available, click **"تحديث بنقرة واحدة" (One-click update)**.
- The Bridge downloads, verifies, and installs the update by itself, then shows
  **"جارٍ التحديث… (Updating…)"** and returns to normal. You don't touch the
  Bridge program.
- Updates are safe: if anything goes wrong, the Bridge automatically keeps the
  previous version so it can roll back.

## 7. Restarting

You can restart from the Dashboard — no need to touch the computer:

- **"إعادة الاتصال" (Reconnect):** re-establish the WhatsApp connection.
- **"إعادة تشغيل Bridge" (Restart Bridge):** restart the Bridge cleanly.
- **"قطع اتصال واتساب" (Disconnect WhatsApp):** pause WhatsApp but keep the
  device linked (use "Reconnect" or "Start QR" to bring it back).

## 8. Recovery (it heals itself)

The Bridge is built to recover on its own:

- If the computer **reboots**, the Bridge starts again automatically.
- If the **internet drops**, it reconnects automatically when it's back.
- If a message can't be sent right away, it's **safely queued** and delivered
  when the connection returns.
- Your WhatsApp session is saved locally, so a restart does **not** make you scan
  the QR again.

If a device shows **"غير متصل" (Offline)** for a while, make sure that computer is
on and connected to the internet.

## 9. Troubleshooting

| You see | Try this |
|---|---|
| Device shows **Offline** | Make sure the computer is powered on and online. |
| **"جارٍ الاتصال" (Connecting)** stuck | Click **Start QR** and scan again. |
| QR won't scan | Click **Refresh QR**, make the screen brighter, hold the phone steady. |
| WhatsApp keeps disconnecting | Click **Reconnect**; if it persists, **Start QR** and re-scan. |
| Nothing sends/receives | Check the card says **WhatsApp connected**; check **Diagnostics** (Section 11). |
| An update seems stuck | Wait a minute; if needed, use **Restart Bridge**. |

## 10. Logs

- On a Bridge card, open **"السجلات" (Logs) → "عرض السجلات المباشرة"
  (Show live logs)**. Recent activity appears live.
- Use **"نسخ" (Copy)** or **"تنزيل" (Download)** to save the logs — handy if you
  contact support.

## 11. Diagnostics

The **"التشخيص" (Diagnostics)** section on each card shows quick health checks:

- **خدمة KEYONE (KEYONE service)** — the cloud is reachable.
- **اتصال Bridge (Bridge connection)** — your device is online.
- **اتصال واتساب (WhatsApp connection)** — WhatsApp is connected.

Green ✅ = healthy. ⏳ = in progress. ❌ = needs attention (see Troubleshooting).

## 12. Common errors

| Message | Meaning | What to do |
|---|---|---|
| **"الجهاز غير متصل" (Device offline)** | The Bridge computer is off or has no internet. | Power it on / check the network. |
| **"لا يوجد رقم واتساب مرتبط" (No WhatsApp linked)** | No number connected yet. | Click **Start QR** and scan. |
| **"انتهت صلاحية الرمز" (QR expired)** | The QR timed out. | Click **Refresh QR** and scan again. |
| **"انقطع الاتصال بواتساب" (WhatsApp connection lost)** | The WhatsApp session dropped or was logged out. | Click **Start QR** and re-scan. |
| **Link code expired** | The login code timed out. | Run `keyone-bridge login` again. |

If an error persists, copy the logs (Section 10) and contact KEYONE support.

## 13. Backup

Your Bridge keeps its settings and WhatsApp session in one folder. To back it up,
copy that folder while the Bridge is **stopped**:

- **Windows:** `%AppData%\keyone-bridge` (or `C:\ProgramData\KEYONE Bridge` if
  installed as a service).
- **macOS:** `~/Library/Application Support/keyone-bridge`
- **Linux (personal):** `~/.config/keyone-bridge`
- **Linux (server/service):** `/var/lib/keyone-bridge`

Keep this backup private — it contains your WhatsApp session.

## 14. Restore

To move to a new computer or restore a backup:

1. Install KEYONE Bridge on the new computer (Section 1).
2. Stop the Bridge, then copy your backed-up folder into the same location
   listed in Section 13.
3. Start the Bridge. If the WhatsApp session is still valid, it reconnects
   without a new QR. If not, just **Start QR** and scan again (Section 5).

*The simplest path is always: install fresh, then link + scan a new QR — you do
not have to restore anything to get running.*

## 15. Uninstall

- **Windows:** Settings → Apps → **KEYONE Bridge → Uninstall** (or run the
  provided `uninstall.ps1` as Administrator).
- **macOS:** run the provided `uninstall-macos.sh`.
- **Linux (.deb):** `sudo apt remove keyone-bridge`; otherwise run
  `uninstall-linux.sh`.
- **Docker:** `docker rm -f keyone-bridge`.

Before uninstalling, you can run `keyone-bridge logout` to wipe the local WhatsApp
session, and click **"فصل الجهاز" (Unlink device)** in the Dashboard to remove it
from your workspace.

## 16. Security recommendations

- **KEYONE never sees your WhatsApp login.** Your WhatsApp session stays **only**
  on your computer — it is never uploaded. KEYONE stores only a hashed connection
  token and message content needed to run your automations.
- **Run Bridge on a machine you trust and control** — ideally an always-on PC or a
  small server, kept updated and behind a normal firewall.
- **Keep the computer's login protected** (a password / disk encryption). The
  Bridge's local data includes your WhatsApp session.
- **Keep Bridge updated** (Section 6) — updates include security fixes.
- **Only link devices you recognize.** If a device looks unfamiliar in the
  Dashboard, click **"فصل الجهاز" (Unlink device)** immediately — that revokes its
  access instantly.
- **If a computer is lost or compromised:** unlink it in the Dashboard right away.
  Its token is revoked and it can no longer connect.

---

*Need help? Copy your logs (Section 10) and contact KEYONE support with your
device name and what you were doing.*
