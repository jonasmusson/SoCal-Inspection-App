import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://configuration-required.supabase.co',
  supabaseAnonKey || 'configuration-required', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  });
