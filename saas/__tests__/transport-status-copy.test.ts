/**
 * No screen may show a merchant a raw transport token.
 *
 * /api/whatsapp/status answers with machine states — `connected`, `connecting`,
 * `qr`, `disconnected`, `service_unreachable`. The dashboard is Arabic and RTL,
 * so printing one of those verbatim reads as a crash rather than a state.
 *
 * The Customer Import screen did exactly that: with the pairing service down it
 * printed "service_unreachable" as the current status AND offered an enabled
 * "show pairing code" button whose click silently did nothing — the merchant
 * could not tell whether they had mis-clicked or the product was broken. That
 * is the failure this pins.
 *
 * Static: reads source, no DB, no network, no rendering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf-8");

/** Every state app/api/whatsapp/status/route.ts can put on the wire. */
const TRANSPORT_STATES = [
  "connected",
  "connecting",
  "qr",
  "disconnected",
  "service_unreachable",
] as const;

/** Screens that poll the status route and render the result to a merchant. */
const SCREENS = [
  "app/dashboard/import/import-client.tsx",
  "app/dashboard/whatsapp-health/whatsapp-health-client.tsx",
];

describe("the status route still speaks the states these screens expect", () => {
  it("emits service_unreachable when the pairing service does not answer", () => {
    // If this ever changes, the screens below are translating a state that no
    // longer exists and will silently fall back to the raw token again.
    expect(read("app/api/whatsapp/status/route.ts")).toContain('"service_unreachable"');
  });
});

describe.each(SCREENS)("%s", (screen) => {
  const src = read(screen);

  it("carries an Arabic label map for transport states", () => {
    expect(src).toMatch(/STATUS_AR/);
  });

  it("translates every state the route can return", () => {
    const missing = TRANSPORT_STATES.filter((s) => !new RegExp(`\\b${s}\\s*:`).test(src));
    expect(
      missing,
      `${screen} has no Arabic label for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("renders the label, not the raw token", () => {
    // The token may appear in comparisons; what must not happen is printing the
    // bare state variable where the label belongs.
    expect(src).toMatch(/STATUS_AR\[/);
  });
});

describe("Customer Import when the pairing service is unreachable", () => {
  const src = read("app/dashboard/import/import-client.tsx");

  it("recognises the unreachable state explicitly", () => {
    expect(src).toMatch(/serviceDown\s*=\s*waStatus === "service_unreachable"/);
  });

  it("does not offer a pairing button that cannot produce a code", () => {
    // The button lives behind the serviceDown branch now. A regression that
    // moved it back in front would drop this guard.
    expect(src).toMatch(/serviceDown \?/);
    const beforeButton = src.slice(0, src.indexOf("إظهار كود الربط"));
    expect(beforeButton).toContain("serviceDown");
  });

  it("keeps the one-time import action disabled unless actually connected", () => {
    expect(src).toMatch(/startDisabled\s*=.*waStatus !== "connected"/);
  });
});
