import { createClient } from '@supabase/supabase-js';
const url: unknown = import.meta.env.VITE_SUPABASE_URL;
const key: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname === '/'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}
const endpoint = publicUrl(url);
export const auth =
  endpoint && typeof key === 'string' && key.startsWith('sb_publishable_')
    ? createClient(endpoint, key).auth
    : null;
