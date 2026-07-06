/**
 * lib/qr-queue — public surface for the QR Queue Platform.
 *
 * QR session scheduling + reservation over the finite Smart QR Pool capacity.
 * Booking → Capacity Manager → lane packing → reservation → activation cron →
 * lifecycle. Never imports or touches the WhatsApp send pipeline.
 */
export { qrQueueFlags, HOLDING_STATUSES } from "./flags";
export type { QrReservationStatus, QrReservationPurpose } from "./flags";
export {
  checkAvailability,
  lowestFreeLane,
  suggestNextSlot,
  peakOverlap,
  type AvailabilityResult,
} from "./capacity";
export {
  bookReservation,
  cancelReservation,
  completeReservation,
  drive,
  myReservations,
  reservationById,
  queuePositionFor,
  type BookInput,
  type BookResult,
  type DriveReport,
} from "./reservations";
export {
  getQueueAnalytics,
  getQueueSnapshot,
  type QueueAnalytics,
  type QueueSnapshot,
} from "./analytics";
