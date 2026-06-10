// Universal Providers — domain service registry (server-only).
//
// Each domain (ai/speech/image/sms/email) registers a service here as its phase
// lands. The generic settings dashboard + API routes dispatch through this
// registry, so adding a domain never requires new routes — only a service.
//
// A service exposes a `ping(provider)` health probe (throws IntegrationError on
// failure). Domain-specific operations (chat/transcribe/send/...) live on the
// domain's own module and are called from their wiring points; they are not
// part of this generic surface.

import type { ProviderDomain, ResolvedProvider } from "./types";

export interface DomainService {
  domain: ProviderDomain;
  /** Lightweight credential check. Resolves on success; throws on failure. */
  ping(provider: ResolvedProvider): Promise<void>;
}

const SERVICES: Partial<Record<ProviderDomain, DomainService>> = {};

export function registerService(service: DomainService): void {
  SERVICES[service.domain] = service;
}

export function getService(domain: ProviderDomain): DomainService | null {
  return SERVICES[domain] || null;
}

export function hasService(domain: ProviderDomain): boolean {
  return !!SERVICES[domain];
}

// NOTE: domain self-registration lives in ./register (a separate side-effect
// module) to avoid a circular import: domains import registerService from here,
// so this module must not import them back.
