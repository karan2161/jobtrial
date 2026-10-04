import { paginate } from '../utils/response.js';
import { unwrap } from '../utils/errors.js';
import { stripUndefined } from '../utils/validation.js';
import { activityService } from './activityService.js';
import { assertRefs, OWN } from './ownership.js';

const CARD = 'id, company_name, company_logo_url, job_title, location, salary, work_mode, status, application_date, resume_version_id, job_description_id, notes, created_at, updated_at, resume_version:resume_versions(id, version_name, ats_score)';
const DETAIL = `*, resume_version:resume_versions(id, version_name, ats_score, resume_id), job_description:job_descriptions(id, title, company, raw_text, analysis, extracted_skills), events:application_events(*), interviews(*), reminders(*)`;
// strip characters that have meaning inside a PostgREST filter expression
const safeTerm = (q) => q.replace(/[,()*%\\:"']/g, ' ').trim();

export const applicationService = {
  async list(db, userId, { page, limit, q, status, sort, order }) {
    let query = db.from('applications').select(CARD, { count: 'exact' }).eq('user_id', userId);
    if (status) query = query.eq('status', status);
    const term = q && safeTerm(q);
    if (term) {
      const like = `%${term}%`;
      const statusHit = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'].find((s) => s.startsWith(term.toLowerCase()));
      query = query.or([`company_name.ilike.${like}`, `job_title.ilike.${like}`, `location.ilike.${like}`, statusHit && `status.eq.${statusHit}`].filter(Boolean).join(','));
    }
    const from = (page - 1) * limit;
    const { data, error, count } = await query.order(sort, { ascending: order === 'asc', nullsFirst: false }).order('id').range(from, from + limit - 1);
    if (error) unwrap({ error });
    return { data, pagination: paginate(page, limit, count ?? 0) };
  },

  async get(db, userId, id) {
    const row = unwrap(await db.from('applications').select(DETAIL).eq('id', id).eq('user_id', userId)
      .order('created_at', { referencedTable: 'application_events', ascending: true })
      .order('scheduled_at', { referencedTable: 'interviews', ascending: true }).maybeSingle());
    if (!row) await OWN.application(db, id, userId, 'id'); // throws the standard 404
    return row;
  },

  async create(db, userId, body) {
    const { create_follow_up_reminder, ...fields } = body;
    await assertRefs(db, userId, fields);
    const row = unwrap(await db.from('applications').insert({ ...fields, user_id: userId }).select(CARD).single());
    // DB trigger has already written the 'created' event and activity log atomically with the insert.
    if (create_follow_up_reminder) {
      const base = fields.application_date ? new Date(fields.application_date) : new Date();
      const due = new Date(base.getTime() + 7 * 864e5);
      if (due < new Date()) due.setTime(Date.now() + 864e5);
      unwrap(await db.from('reminders').insert({ user_id: userId, application_id: row.id, type: 'follow_up',
        title: `Follow up with ${row.company_name}`, description: `Check in on your ${row.job_title} application.`, due_at: due.toISOString() }));
    }
    return row;
  },

  async update(db, userId, id, body) {
    await OWN.application(db, id, userId, 'id');
    await assertRefs(db, userId, body);
    const patch = stripUndefined(body);
    if (!Object.keys(patch).length) return this.get(db, userId, id);
    return unwrap(await db.from('applications').update(patch).eq('id', id).eq('user_id', userId).select(CARD).single());
  },

  /** Atomic: update + event + activity log all happen inside one DB function/trigger. */
  async changeStatus(db, userId, id, status, note) {
    return unwrap(await db.rpc('change_application_status', { p_id: id, p_status: status, p_note: note ?? null }));
  },

  async remove(db, userId, id) {
    const a = await OWN.application(db, id, userId, 'id, company_name');
    unwrap(await db.from('applications').delete().eq('id', id).eq('user_id', userId));
    await activityService.log(db, userId, 'application_deleted', 'application', id, { company: a.company_name });
  },

  async addEvent(db, userId, id, { event_type, description }) {
    await OWN.application(db, id, userId, 'id');
    return unwrap(await db.from('application_events').insert({ application_id: id, user_id: userId, event_type, description: description ?? null }).select().single());
  },
};
