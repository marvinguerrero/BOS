/**
 * Utility to get a typed Supabase client that works around TypeScript inference
 * issues with complex generic Database types. Import this in client/server
 * components instead of using the raw client directly for DML operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabase = SupabaseClient<any, any, any>

export function asQ(supabase: unknown): AnySupabase {
  return supabase as AnySupabase
}
