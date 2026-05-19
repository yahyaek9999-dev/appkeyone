/**
 * BaileysProvider — Phase 3 dormant stub.
 *
 * Production safety notes:
 * - Not imported by the active provider router.
 * - Returns NOT_IMPLEMENTED for every send path.
 * - Does not import Baileys or create sockets.
 * - Exists only so future work has a typed extension point without touching
 *   QR / Meta hot paths.
 */

import {
  ERR,
  type MessagingProvider,
  type ProviderResult,
  type ProviderStatus,
  type SendMediaArgs,
  type SendTemplateArgs,
  type SendTextArgs,
} from "./provider";
import { baileysReadiness } from "./baileys-flags";

function dormant(method: string): ProviderResult {
  return {
    ok: false,
    errorCode: ERR.NOT_IMPLEMENTED,
    errorDetail: `Baileys provider is scaffolded but inactive (${method})`,
    data: baileysReadiness(),
  };
}

export class BaileysProvider implements MessagingProvider {
  readonly name = "baileys" as const;

  async sendMessage(_args: SendTextArgs): Promise<ProviderResult> {
    return dormant("sendMessage");
  }

  async sendMedia(_args: SendMediaArgs): Promise<ProviderResult> {
    return dormant("sendMedia");
  }

  async sendTemplate(_args: SendTemplateArgs): Promise<ProviderResult> {
    return dormant("sendTemplate");
  }

  async markSeen(
    _userId: string,
    _providerMsgId: string,
  ): Promise<ProviderResult> {
    return dormant("markSeen");
  }

  async typing(
    _userId: string,
    _to: string,
    _on: boolean,
  ): Promise<ProviderResult> {
    return dormant("typing");
  }

  async getStatus(_userId: string): Promise<ProviderStatus> {
    const readiness = baileysReadiness();
    return {
      state: readiness.enabled ? "not_configured" : "disabled",
      detail: readiness.reason,
    };
  }

  async validateRecipient(
    _userId: string,
    _phone: string,
  ): Promise<ProviderResult<{ exists: "yes" | "no" | "unknown" }>> {
    return {
      ok: true,
      data: { exists: "unknown" },
    };
  }
}

export const baileysProvider = new BaileysProvider();
