let rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim()

// Auto-prefix https:// if user provided a bare domain (e.g. "calm-smile-production-a1a9.up.railway.app")
if (rawApiUrl && !rawApiUrl.startsWith('http://') && !rawApiUrl.startsWith('https://')) {
  rawApiUrl = `https://${rawApiUrl}`
}
rawApiUrl = rawApiUrl.replace(/\/+$/, '')

export const env = {
  API_BASE_URL: rawApiUrl,
  SUPABASE_URL: ((import.meta.env.VITE_SUPABASE_URL as string) || '').trim(),
  SUPABASE_ANON_KEY: ((import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '').trim(),
}

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables')
}