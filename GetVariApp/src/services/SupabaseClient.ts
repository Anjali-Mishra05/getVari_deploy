import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ntuboicvzsoamwedtprg.supabase.co';
const supabaseAnonKey = 'sb_publishable_24w1KsSoKG0A9MiXDVDa_A_sUewgfxM';

// Handle storage for both Web and React Native
let authStorage;
if (typeof window !== 'undefined' && window.localStorage) {
  authStorage = window.localStorage;
} else {
  // We use require here to avoid top-level import that might break web builds
  // if the packager/bundler doesn't support the module.
  authStorage = require('@react-native-async-storage/async-storage').default;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
