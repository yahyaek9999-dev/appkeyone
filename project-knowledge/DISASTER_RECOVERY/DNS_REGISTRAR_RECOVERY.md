# DNS_REGISTRAR_RECOVERY — KEYONE

**Date:** 2026-06-12 · Closes retirement-checklist item #6 (DNS documented). Verified via live `whois` + `dig` (read-only).

---

## 1. Verified facts (live lookup 2026-06-12)

| Item | Value | Source |
|---|---|---|
| **Domain** | `keyone1.com` | whois |
| **Registrar** | **HOSTINGER operations, UAB** (IANA ID 1636) | whois `Registrar:` |
| **Registrar URL** | https://www.hostinger.com | whois |
| **Registry expiry** | **2027-05-07** (renewed 2026-05-07) | whois `Registry Expiry Date` |
| **Transfer lock** | `clientTransferProhibited` (✅ anti-hijack lock on) | whois `Domain Status` |
| **DNS host / nameservers** | `aster.dns-parking.com`, `helios.dns-parking.com` (= **Hostinger** managed DNS) | whois / `dig NS` |
| **Live A record** | `app.keyone1.com → 217.154.163.16` (the VPS) | `dig +short A` |
| **Stale subdomain** | `k1wb.app.keyone1.com` → **does not resolve** (the Caddyfile host is unused) | `dig` |
| **Abuse contact** | abuse-tracker@hostinger.com · +370 645 03378 | whois |

➡️ **Both registration and DNS are at Hostinger.** Re-pointing the domain during recovery is a single Hostinger hPanel action.

## 2. Ownership / recovery access — to be confirmed & vaulted by the owner

These cannot be verified programmatically (they require account login). **The owner must confirm and store the following in the password vault before retirement:**

- [ ] **Hostinger account email** (the login that owns `keyone1.com`)
- [ ] **Hostinger password** + **2FA** method and **2FA recovery codes**
- [ ] Recovery email/phone on the Hostinger account
- [ ] Confirmation that the account is in good standing and the domain auto-renews (expiry 2027-05-07)
- [ ] *(optional, strongest)* the EPP/auth code (only if ever transferring the domain away from Hostinger)

> Without Hostinger account access, you **cannot re-point `app.keyone1.com`** to a new server — the domain (not the data) becomes the recovery blocker.

## 3. Recovery procedure — re-point the domain to a new server

```text
1. Log into Hostinger hPanel (https://hpanel.hostinger.com) with the vaulted credentials.
2. Domains → keyone1.com → DNS / Nameservers → DNS Zone (records managed via dns-parking.com).
3. Edit the A record:   app   A   <NEW_SERVER_IP>   (TTL: lower to 300s a day before cutover)
4. (optional cleanup) remove the unused 'k1wb.app' record if present.
5. Wait for propagation (TTL-bound). Caddy on the new host auto-issues a fresh
   Let's Encrypt cert once app.keyone1.com resolves to it.
6. Verify:  dig +short A app.keyone1.com  → <NEW_SERVER_IP>;  https://app.keyone1.com/api/health → ok
```

## 4. Pre-retirement DNS actions

- **If migrating** to a new host: lower TTL to 300s now, then change the A record at cutover (Scenario B / Ubuntu plan).
- **If shutting down** with no replacement: remove the `app` A record so the dead IP stops resolving (avoids stale/abandoned-endpoint exposure). Keep the domain registered (paid through 2027-05-07) so it can be re-pointed later.
- **Do not** let the domain lapse — losing `keyone1.com` would forfeit the brand/endpoint even if all data is preserved.

## 5. Status

✅ **DNS now documented** (registrar = Hostinger, NS, records, expiry, procedure). Remaining: the owner must vault the **Hostinger account access** (§2) — that is the one human-held item this audit cannot capture.
