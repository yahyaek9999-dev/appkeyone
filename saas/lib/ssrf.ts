// SSRF guard for server-side fetches of user/tenant-supplied URLs.
//
// Threat: a logged-in merchant can make the server fetch an arbitrary URL
// (knowledge import-url, commerce catalog sync via storeUrl). Without a guard
// they can target internal services (the WhatsApp service on 127.0.0.1:3001,
// the LLM service, Redis, the app's own x-internal-secret endpoints) or cloud
// metadata (169.254.169.254), and use the reflected status/content-type as an
// oracle to map the internal network.
//
// Defense: validate scheme is http/https, reject literal private/reserved IPs,
// resolve the hostname and reject if ANY resolved address is private, and when
// following redirects re-validate every hop. This blocks the practical attacks;
// a residual DNS-rebinding window remains (resolve-then-connect), documented in
// the security report — acceptable for the authenticated threat model here.

import { lookup } from "dns";
import { promisify } from "util";
import net from "net";

const dnsLookup = promisify(lookup);

/** True if an IP literal is loopback / private / link-local / reserved. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p.some((n) => Number.isNaN(n))) return true;
    if (p[0] === 0) return true; // "this" network
    if (p[0] === 10) return true; // private
    if (p[0] === 127) return true; // loopback
    if (p[0] === 169 && p[1] === 254) return true; // link-local + cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // private
    if (p[0] === 192 && p[1] === 168) return true; // private
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // IETF protocol assignments
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast (224-239) + reserved (240-255)
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (low === "::1" || low === "::") return true; // loopback / unspecified
    if (low.startsWith("fe80")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique-local
    if (low.startsWith("::ffff:")) {
      // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hex:hex)
      const tail = low.slice("::ffff:".length);
      if (tail.includes(".")) return isPrivateIp(tail);
    }
    return false;
  }
  return true; // not a valid IP literal → deny
}

/**
 * Validates a user-supplied URL is a public http/https endpoint and returns the
 * parsed URL. Throws Error("blocked_url") for anything internal/unsafe.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("blocked_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked_url");

  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new Error("blocked_url");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("blocked_url");
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("blocked_url");
    return u;
  }

  // Resolve and reject if any resolved address is internal.
  let records: { address: string }[];
  try {
    records = await dnsLookup(host, { all: true });
  } catch {
    throw new Error("blocked_url");
  }
  if (!records.length) throw new Error("blocked_url");
  for (const rec of records) {
    if (isPrivateIp(rec.address)) throw new Error("blocked_url");
  }
  return u;
}

/**
 * SSRF-safe fetch: validates the destination (and every redirect hop) against
 * internal ranges before connecting. Drop-in for `fetch` for user-supplied URLs.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? 3;
  const { maxRedirects: _omit, ...rest } = init;
  let current = (await assertPublicHttpUrl(raw)).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(current, { ...rest, redirect: "manual" });
    const status = res.status;
    if (status >= 300 && status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      const next = new URL(location, current).toString();
      await assertPublicHttpUrl(next); // re-validate each hop
      current = next;
      continue;
    }
    return res;
  }
  throw new Error("too_many_redirects");
}
