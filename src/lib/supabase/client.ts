import { createBrowserClient } from '@supabase/ssr'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export function createClient(): AnyClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
