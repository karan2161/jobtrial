import { env } from '../config/env.js';
import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { AppError, badRequest, unauthorized } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const session = (s) => s && ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, token_type: 'bearer' });

async function purgeStorage(userId) {
  const bucket = supabaseAdmin.storage.from(env.RESUME_BUCKET);
  const { data: dirs, error } = await bucket.list(userId, { limit: 1000 });
  if (error) throw new AppError(502, 'STORAGE_ERROR', 'Could not remove your files. Nothing was deleted; please retry.');
  const paths = [];
  for (const d of dirs ?? []) {
    const { data: files } = await bucket.list(`${userId}/${d.name}`, { limit: 1000 });
    for (const f of files ?? []) paths.push(`${userId}/${d.name}/${f.name}`);
  }
  if (paths.length) {
    const r = await bucket.remove(paths);
    if (r.error) throw new AppError(502, 'STORAGE_ERROR', 'Could not remove your files. Nothing was deleted; please retry.');
  }
}

export const authService = {
  async signup({ email, password, full_name }) {
    const { data, error } = await supabaseAnon.auth.signUp({ email, password, options: { data: { full_name: full_name ?? '' }, emailRedirectTo: `${env.FRONTEND_URL}/login` } });
    if (error) throw badRequest('SIGNUP_FAILED', 'Could not create the account. Check your details or try logging in.');
    return { user: data.user && { id: data.user.id, email: data.user.email }, session: session(data.session), requires_email_confirmation: !data.session };
  },
  async login({ email, password }) {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    return { user: { id: data.user.id, email: data.user.email }, session: session(data.session) };
  },
  async refresh(refresh_token) {
    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });
    if (error || !data.session) throw unauthorized('Session expired. Please log in again.');
    return { session: session(data.session) };
  },
  async forgotPassword(email) {
    await supabaseAnon.auth.resetPasswordForEmail(email, { redirectTo: `${env.FRONTEND_URL}/reset-password` }).catch((e) => logger.warn('reset_email_failed', { message: e?.message }));
    // Always succeed: never reveal whether an email is registered.
  },
  /** Called with the recovery-link access token as Bearer. */
  async resetPassword(userId, password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) throw badRequest('PASSWORD_UPDATE_FAILED', 'Could not update the password. Choose a stronger one.');
  },
  async logout(token) {
    const { error } = await supabaseAdmin.auth.admin.signOut(token);
    if (error) logger.warn('logout_failed', { message: error.message });
  },
  /** Storage files first, then the auth user: FK cascades remove every row the user owns. */
  async deleteAccount(userId) {
    await purgeStorage(userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new AppError(502, 'ACCOUNT_DELETE_FAILED', 'Could not delete the account. Please retry.');
    logger.info('account_deleted', { userId });
  },
  /** JSON export of everything the user owns (excludes raw files; those stay downloadable via signed URLs). */
  async exportData(db, userId) {
    const tables = ['profiles', 'resumes', 'resume_versions', 'job_descriptions', 'applications', 'application_events', 'interviews', 'reminders', 'ai_analyses', 'activity_logs', 'chat_conversations', 'chat_messages'];
    const out = { exported_at: new Date().toISOString() };
    for (const t of tables) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      const { data, error } = await db.from(t).select('*').eq(col, userId).limit(10000);
      if (error) throw new AppError(500, 'EXPORT_FAILED', 'Could not export your data.');
      out[t] = data;
    }
    return out;
  },
};
