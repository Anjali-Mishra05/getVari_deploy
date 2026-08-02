import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ntuboicvzsoamwedtprg.supabase.co';
// Replace with your actual Supabase Anon Key from Settings > API
const supabaseAnonKey = 'sb_publishable_24w1KsSoKG0A9MiXDVDa_A_sUewgfxM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
