/**
 * Credentials management - reading API key from environment variables
 */

const DEFAULT_BASE_URL = "https://api.postproxy.dev/api";

/**
 * Get API key from environment variables
 * @returns API key or null if not found
 */
export function getApiKey(): string | null {
  const apiKey = process.env.POSTPROXY_API_KEY;
  return apiKey || null;
}

/**
 * Get base URL from environment variables or use default
 * @returns Base URL for PostProxy API
 */
export function getBaseUrl(): string {
  return process.env.POSTPROXY_BASE_URL || DEFAULT_BASE_URL;
}

/**
 * Validate API key by making a test request (optional)
 * This can be used to verify the key is valid before using it
 */
export async function validateApiKey(apiKey: string, baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/profile_groups/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout for validation
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}
