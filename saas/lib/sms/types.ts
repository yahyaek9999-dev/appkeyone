// K1SMS — shared types

export type SmsProviderType = "twilio" | "vonage" | "unifonic" | "msegat" | "clicksend" | "custom";

export type SmsPurpose =
  | "order_confirmation"
  | "order_status"
  | "otp"
  | "custom";

export type SmsStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "expired"
  | "rejected";

export type OtpPurpose =
  | "signup"
  | "login"
  | "phone_verify"
  | "password_reset"
  | "transaction";

export interface ProviderCreds {
  apiKey?: string | null;
  apiSecret?: string | null;
  senderId?: string | null;
  endpoint?: string | null;
}

export interface SendSmsInput {
  to: string;        // E.164
  body: string;
  senderId?: string;
}

export interface SendSmsResult {
  ok: boolean;
  providerMsgId?: string;
  segments?: number;
  costUnits?: number; // fils × 100
  detail: string;
}

export interface SmsAdapter {
  type: SmsProviderType;
  send(input: SendSmsInput, creds: ProviderCreds): Promise<SendSmsResult>;
  test(creds: ProviderCreds): Promise<{ ok: boolean; detail: string }>;
}
