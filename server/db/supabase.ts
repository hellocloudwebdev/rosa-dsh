/**
 * Backward compatibility layer forwarding to NeonDriver.
 */

import { NeonDriver, toPostgresSql, type NeonDriverOptions } from "./neon.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiEnv } from "../env.js";

export { toPostgresSql };
export type SupabaseDriverOptions = NeonDriverOptions;
export const SupabaseDriver = NeonDriver;

/**
 * Create a Supabase JavaScript client for high-level storage, auth, or realtime.
 */
export function createSupabaseClient(env: ApiEnv): SupabaseClient | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}
