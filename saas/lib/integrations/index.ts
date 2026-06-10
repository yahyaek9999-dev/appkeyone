// Universal Providers — client-safe barrel.
//
// Re-exports ONLY the pure data/types (registry + types) that are safe to import
// from client components. Server-only modules (vault, failover, health, usage,
// services) must be imported directly — they touch prisma/crypto and must never
// be bundled into the client.

export * from "./types";
export * from "./registry";
