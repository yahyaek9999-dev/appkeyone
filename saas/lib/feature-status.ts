/**
 * Feature LIFECYCLE status — the single vocabulary shared by the admin UI and
 * the two feature-control API routes, so the dropdown can never offer a value
 * the zod schema rejects.
 *
 * This axis is NOT visibility. It answers "how finished / how available is this
 * feature", and only `enabled` and `beta` grant ACCESS (see
 * getDisabledFeatureIds()). Whether a customer can SEE the feature is decided
 * solely by FeatureControl.customerVisible.
 *
 * "مخفي" is deliberately absent from these labels: hiding is the visibility
 * axis and lives on the ظهور للعملاء toggle. A lifecycle value that reads
 * "hidden" made the two axes look like one control.
 */
export const FEATURE_STATUSES = [
  "enabled",
  "disabled",
  "hidden",
  "beta",
  "coming_soon",
  "deprecated",
] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

/** Arabic labels for the lifecycle axis. Never use "مخفي" here. */
export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  enabled:     "مفعّل",
  disabled:    "معطّل",
  hidden:      "غير متاح",
  beta:        "تجريبي",
  coming_soon: "قريباً",
  deprecated:  "قديم",
};
