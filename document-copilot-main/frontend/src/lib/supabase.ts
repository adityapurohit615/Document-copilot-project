import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

/**
 * Returns the active user's JWT access token for FastAPI Authorization headers.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}