import { unwrap } from '../utils/errors.js';
import { diffLines } from '../utils/diff.js';
import { activityService } from './activityService.js';
import { assertRefs, OWN } from './ownership.js';

const COLS = 'id, resume_id, job_description_id, parent_version_id, version_name, ats_score, target_company, target_role, created_at, updated_at';

export const resumeVersionService = {
  async list(db, userId, resumeId) {
    let q = db.from('resume_versions').select(`${COLS}, applications(count)`).eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
    if (resumeId) q = q.eq('resume_id', resumeId);
    return unwrap(await q);
  },
  get: (db, userId, id) => OWN.version(db, id, userId, `${COLS}, content, changes`),

  async create(db, userId, body, extra = {}) {
    await OWN.resume(db, body.resume_id, userId, 'id');
    await assertRefs(db, userId, body);
    const row = unwrap(await db.from('resume_versions').insert({ ...body, ...extra, user_id: userId }).select(`${COLS}, content, changes`).single());
    await activityService.log(db, userId, 'resume_version_created', 'resume_version', row.id, { resume_id: row.resume_id });
    return row;
  },
  async update(db, userId, id, body) {
    await OWN.version(db, id, userId, 'id');
    if (body.job_description_id) await OWN.jd(db, body.job_description_id, userId, 'id');
    // Editing content invalidates the stored ATS score: it must be re-analysed against the new text.
    const patch = body.content ? { ...body, ats_score: null } : body;
    return unwrap(await db.from('resume_versions').update(patch).eq('id', id).eq('user_id', userId).select(`${COLS}, content, changes`).single());
  },
  async duplicate(db, userId, id) {
    const v = await OWN.version(db, id, userId, '*');
    return this.create(db, userId, { resume_id: v.resume_id, version_name: `${v.version_name} (copy)`.slice(0, 160), content: v.content,
      job_description_id: v.job_description_id, parent_version_id: v.id, target_company: v.target_company, target_role: v.target_role });
  },
  /** Restore = create a new version from an older one (non-destructive; keeps the history). */
  async restore(db, userId, id) {
    const v = await OWN.version(db, id, userId, '*');
    return this.create(db, userId, { resume_id: v.resume_id, version_name: `Restored: ${v.version_name}`.slice(0, 160), content: v.content,
      job_description_id: v.job_description_id, parent_version_id: v.id, target_company: v.target_company, target_role: v.target_role },
      { ats_score: v.ats_score });
  },
  async remove(db, userId, id) {
    const v = await OWN.version(db, id, userId, 'id, version_name');
    unwrap(await db.from('resume_versions').delete().eq('id', id).eq('user_id', userId));
    await activityService.log(db, userId, 'resume_version_deleted', 'resume_version', id, { name: v.version_name });
  },

  /** Diff this version against: ?against=<version id>, else its parent, else the master resume text. */
  async compare(db, userId, id, againstId) {
    const v = await OWN.version(db, id, userId, 'id, version_name, content, parent_version_id, resume_id');
    let left, label;
    const baseId = againstId ?? v.parent_version_id;
    if (baseId) { const b = await OWN.version(db, baseId, userId, 'version_name, content'); left = b.content; label = b.version_name; }
    else { const r = await OWN.resume(db, v.resume_id, userId, 'name, parsed_text'); left = r.parsed_text ?? ''; label = `${r.name} (original)`; }
    return { left: { label, content: left }, right: { label: v.version_name, content: v.content }, diff: diffLines(left, v.content) };
  },
};
