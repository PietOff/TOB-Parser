import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// Standard anon client — used for auth and user-facing reads
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — bypasses RLS for all writes.
// persistSession: false + storageKey prevent the "Multiple GoTrueClient instances" warning
// because both clients would otherwise share the same localStorage key.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-admin-session',
  },
});
