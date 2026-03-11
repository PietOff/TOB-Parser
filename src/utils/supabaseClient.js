import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '⚠️  Supabase omgevingsvariabelen ontbreken!\n' +
    'Stel VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in via:\n' +
    '  - .env.local (lokaal)\n' +
    '  - Vercel > Project Settings > Environment Variables (productie)'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseKey ?? 'placeholder-key'
);
