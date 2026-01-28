/**
 * TypeScript types for PostProxy API responses and requests
 */

export interface ProfileGroup {
  id: string;
  name: string;
  profiles_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  name: string;
  platform: string;
  profile_group_id: string;
  expires_at: string | null;
  post_count: number;
  username?: string;
  avatar_url?: string;
}

export interface CreatePostParams {
  content: string;
  profile_group_id?: number; // Not used by API, kept for compatibility
  profiles: string[]; // Platform names (e.g., ["twitter"]), not profile IDs
  schedule?: string;
  media?: string[];
  idempotency_key?: string;
  draft?: boolean; // If true, creates a draft post that won't publish automatically
}

export interface CreatePostResponse {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  platforms: PlatformOutcome[];
}

export interface PlatformOutcome {
  platform: string;
  status: "pending" | "processing" | "published" | "failed" | "deleted";
  params: Record<string, any>;
  attempted_at: string | null;
  insights?: {
    impressions?: number;
    on?: string;
    [key: string]: any;
  };
  url?: string;
  post_id?: string;
  error?: string | null; // Error message from platform (replaces error_reason)
}

export interface PostDetails {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  platforms: PlatformOutcome[];
}

export interface Post {
  id: string;
  body?: string; // API returns "body" field
  content?: string; // Some responses use "content"
  status: "draft" | "pending" | "processing" | "processed" | "scheduled";
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  platforms: PlatformOutcome[];
}
