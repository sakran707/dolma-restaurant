// تهيئة Supabase Client عبر ESM CDN — لا يحتاج Node.js أو أي أداة بناء (Bundler)
// يعمل مباشرة على GitHub Pages أو أي Static Hosting.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
