/**
 * Idempotency key generation utilities
 */

import { createHash } from "crypto";

/**
 * Generate an idempotency key from normalized post data
 */
export function generateIdempotencyKey(
  content: string,
  targets: string[],
  schedule?: string,
  media?: string[]
): string {
  // Normalize input data
  const normalizedContent = content.trim();
  const normalizedTargets = [...targets].sort();
  const normalizedSchedule = schedule || "";
  // Media distinguishes posts with no text (e.g. stories)
  const normalizedMedia = [...(media || [])].sort();

  // Create a JSON string from normalized data
  const data = JSON.stringify({
    content: normalizedContent,
    targets: normalizedTargets,
    schedule: normalizedSchedule,
    media: normalizedMedia,
  });

  // Generate SHA256 hash
  const hash = createHash("sha256").update(data).digest("hex");

  return hash;
}
