import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://morqeovgzkamajumrmby.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vcnFlb3ZnemthbWFqdW1ybWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzcyNjQsImV4cCI6MjA4ODgxMzI2NH0.Ov5M7MI1FRnwLFvMHKpNFJDMn9UTvtCHMflIpKXmcdc';

// Service role key — bypasses RLS entirely. Used only for server-side profile reads
// to avoid infinite recursion in the profiles RLS policy.
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vcnFlb3ZnemthbWFqdW1ybWJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzNzI2NCwiZXhwIjoyMDg4ODEzMjY0fQ.bX7T13gP_-28bP_jLLCNaF92LxBaEeMILHeDKd753QE';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('[Supabase] VITE_SUPABASE_URL not set in env — using fallback project URL');
}

// Standard anon client — used for auth and user-facing queries
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — bypasses RLS, only used for internal profile lookups
// Never expose this to untrusted user input
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
