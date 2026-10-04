import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, badRequest, unwrap } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { activityService } from './activityService.js';
import { OWN } from './ownership.js';
import { detectFileType, extractText, mimeFor, parseResumeText } from './resumeParserService.js';

const LIST_COLS = 'id, name, original_filename, file_type, file_size, created_at, updated_at, parsed_data, resume_versions(count), applications(count)';
const SAFE_COLS = 'id, name, original_filename, file_type, file_size, parsed_data, created_at, updated_at';

export const resumeService = {
  async list(db, userId) {
    return unwrap(await db.from('resumes').select(LIST_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(100));
  },
  /** Returns metadata + parsed profile. Full text only via ?include=text to keep list payloads small. */
  async get(db, userId, id, includeText = false) {
    return OWN.resume(db, id, userId, includeText ? `${SAFE_COLS}, parsed_text` : SAFE_COLS);
  },

  async create(db, userId, file, name) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Attach a resume file in the "file" field.');
    const maxBytes = env.MAX_RESUME_MB * 1024 * 1024;
    if (file.size > maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `File exceeds the ${env.MAX_RESUME_MB} MB limit.`);
    const type = detectFileType(file.buffer, file.originalname, file.mimetype);
    const text = await extractText(file.buffer, type); // parse BEFORE upload so unreadable files leave nothing behind
    const parsed = parseResumeText(text);

    const id = crypto.randomUUID();
    const path = `${userId}/${id}/original.${type}`;
    const up = await supabaseAdmin.storage.from(env.RESUME_BUCKET).upload(path, file.buffer, { contentType: mimeFor(type), upsert: false });
    if (up.error) { logger.error('resume_upload_failed', { message: up.error.message }); throw new AppError(502, 'STORAGE_ERROR', 'Could not store the file. Please retry.'); }

    const safeName = (file.originalname || 'resume').replace(/[^\w.\- ]+/g, '_').slice(0, 160);
    const { data, error } = await db.from('resumes').insert({
      id, user_id: userId, name: (name || safeName.replace(/\.(pdf|docx)$/i, '')).slice(0, 120),
      original_filename: safeName, storage_path: path, file_type: type, file_size: file.size,
      parsed_text: text, parsed_data: { ...parsed, sections: undefined },
    }).select(SAFE_COLS).single();
    if (error) { await supabaseAdmin.storage.from(env.RESUME_BUCKET).remove([path]); unwrap({ error }); } // no orphan files
    await activityService.log(db, userId, 'resume_uploaded', 'resume', id, { type, size: file.size });
    return data;
  },

  async rename(db, userId, id, name) {
    await OWN.resume(db, id, userId, 'id');
    return unwrap(await db.from('resumes').update({ name }).eq('id', id).eq('user_id', userId).select(SAFE_COLS).single());
  },

  async remove(db, userId, id) {
    const r = await OWN.resume(db, id, userId, 'id, storage_path, name');
    if (r.storage_path) await supabaseAdmin.storage.from(env.RESUME_BUCKET).remove([r.storage_path]);
    unwrap(await db.from('resumes').delete().eq('id', id).eq('user_id', userId));
    await activityService.log(db, userId, 'resume_deleted', 'resume', id, { name: r.name });
  },

  /** Short-lived signed URL. Ownership is verified first; bucket is private. */
  async downloadUrl(db, userId, id) {
    const r = await OWN.resume(db, id, userId, 'storage_path, original_filename');
    const { data, error } = await supabaseAdmin.storage.from(env.RESUME_BUCKET).createSignedUrl(r.storage_path, 60, { download: r.original_filename });
    if (error) throw new AppError(502, 'STORAGE_ERROR', 'Could not create a download link.');
    return { url: data.signedUrl, expires_in: 60 };
  },
};
