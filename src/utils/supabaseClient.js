import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://morqeovgzkamajumrmby.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vcnFlb3ZnemthbWFqdW1ybWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzcyNjQsImV4cCI6MjA4ODgxMzI2NH0.S2KFPf8xV3YYqY15i7PCd3DiBgVmWGLF8_W9pMbiupw';

export const supabase = createClient(supabaseUrl, supabaseKey);
