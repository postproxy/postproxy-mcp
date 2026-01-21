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
  network: string; // API uses "network" field
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
}

export interface CreatePostResponse {
  id: string;
  content: string;
  status: string;
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  platforms: PlatformOutcome[];
}

export interface PlatformOutcome {
  network: string;
  status: "pending" | "published" | "failed";
  params: Record<string, any>;
  attempted_at: string | null;
  insights?: {
    impressions?: number;
    on?: string;
    [key: string]: any;
  };
  url?: string;
  post_id?: string;
  error_reason?: string;
}

export interface PostDetails {
  id: string;
  content: string;
  status: string;
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  platforms: PlatformOutcome[];
}

export interface Post {
  id: string;
  content: string;
  status: string;
  draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string;
  platforms: PlatformOutcome[];
}
