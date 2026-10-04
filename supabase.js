import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client. Bypasses RLS: use ONLY for Storage, token validation and account deletion. */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);

/** Anonymous client for signup / login / password-reset flows. */
export const supabaseAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

/** Per-request client acting AS the user: their JWT is forwarded so Postgres RLS applies. */
export const createUserClient = (accessToken) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
