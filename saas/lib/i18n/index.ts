import { ar } from "./ar";
import { en } from "./en";

export type Locale = "ar" | "en";
export type Messages = typeof ar | typeof en;

export const messages = { ar, en } as const;

export function getLocale(langParam?: string | null): Locale {
  return langParam === "en" ? "en" : "ar";
}

export function t<L extends Locale>(locale: L): (typeof messages)[L] {
  return messages[locale];
}

export { ar, en };
