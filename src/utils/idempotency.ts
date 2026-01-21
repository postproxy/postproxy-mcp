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
  schedule?: string
): string {
  // Normalize input data
  const normalizedContent = content.trim();
  const normalizedTargets = [...targets].sort();
  const normalizedSchedule = schedule || "";

  // Create a JSON string from normalized data
  const data = JSON.stringify({
    content: normalizedContent,
    targets: normalizedTargets,
    schedule: normalizedSchedule,
  });

  // Generate SHA256 hash
  const hash = createHash("sha256").update(data).digest("hex");

  return hash;
}
