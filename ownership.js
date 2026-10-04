import { notFound, unwrap } from '../utils/errors.js';

/** Confirm a row exists AND belongs to the user. Returns the row. Never trust IDs from the client. */
export async function assertOwned(db, table, id, userId, code, message, columns = '*') {
  const row = unwrap(await db.from(table).select(columns).eq('id', id).eq('user_id', userId).maybeSingle());
  if (!row) throw notFound(code, message);
  return row;
}
export const OWN = {
  resume: (db, id, u, cols) => assertOwned(db, 'resumes', id, u, 'RESUME_NOT_FOUND', 'Resume not found.', cols),
  version: (db, id, u, cols) => assertOwned(db, 'resume_versions', id, u, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.', cols),
  jd: (db, id, u, cols) => assertOwned(db, 'job_descriptions', id, u, 'JOB_DESCRIPTION_NOT_FOUND', 'Job description not found.', cols),
  interview: (db, id, u, cols) => assertOwned(db, 'interviews', id, u, 'INTERVIEW_NOT_FOUND', 'Interview not found.', cols),
  reminder: (db, id, u, cols) => assertOwned(db, 'reminders', id, u, 'REMINDER_NOT_FOUND', 'Reminder not found.', cols),
  application: (db, id, u, cols) => assertOwned(db, 'applications', id, u, 'APPLICATION_NOT_FOUND', 'Application not found.', cols),
};
/** Validate any optional foreign keys present in a payload. */
export async function assertRefs(db, userId, body) {
  if (body.resume_id) await OWN.resume(db, body.resume_id, userId, 'id');
  if (body.resume_version_id) await OWN.version(db, body.resume_version_id, userId, 'id');
  if (body.job_description_id) await OWN.jd(db, body.job_description_id, userId, 'id');
  if (body.application_id) await OWN.application(db, body.application_id, userId, 'id');
  if (body.parent_version_id) await OWN.version(db, body.parent_version_id, userId, 'id');
}
