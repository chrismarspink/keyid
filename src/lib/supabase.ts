import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://leseqdfucxuivrpufepc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__FfJg_yCmfKe0GF77yiL7g_sPmzRnAT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
