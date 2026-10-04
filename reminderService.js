import { paginate } from '../utils/response.js';
import { unwrap } from '../utils/errors.js';
import { activityService } from './activityService.js';
import { assertRefs, OWN } from './ownership.js';

const COLS = '*, application:applications(id, company_name, job_title)';
const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); };

export const reminderService = {
  /** filter: upcoming (due later, incl. today) | overdue | today | all. Snoozed reminders use effective_due_at. */
  async list(db, userId, { filter, application_id, page, limit }) {
    const now = new Date().toISOString();
    let q = db.from('reminders').select(COLS, { count: 'exact' }).eq('user_id', userId);
    if (application_id) q = q.eq('application_id', application_id);
    if (filter === 'upcoming') q = q.eq('completed', false).gte('effective_due_at', now);
    else if (filter === 'overdue') q = q.eq('completed', false).lt('effective_due_at', now);
    else if (filter === 'today') q = q.eq('completed', false).lte('effective_due_at', endOfDay());
    const from = (page - 1) * limit;
    const { data, error, count } = await q.order('effective_due_at', { ascending: filter !== 'all' ? true : false }).range(from, from + limit - 1);
    if (error) unwrap({ error });
    return { data, pagination: paginate(page, limit, count ?? 0) };
  },
  async summary(db, userId, limit = 5) {
    const now = new Date().toISOString();
    const [upcoming, overdue] = await Promise.all([
      db.from('reminders').select(COLS).eq('user_id', userId).eq('completed', false).gte('effective_due_at', now).order('effective_due_at').limit(limit),
      db.from('reminders').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('completed', false).lt('effective_due_at', now),
    ]);
    return { upcoming: unwrap(upcoming), overdueCount: overdue.count ?? 0 };
  },
  async create(db, userId, body) {
    await assertRefs(db, userId, body);
    return unwrap(await db.from('reminders').insert({ ...body, user_id: userId }).select(COLS).single());
  },
  async update(db, userId, id, body) {
    await OWN.reminder(db, id, userId, 'id');
    await assertRefs(db, userId, body);
    const patch = body.due_at ? { ...body, snoozed_until: null } : body; // a new due date replaces any snooze
    return unwrap(await db.from('reminders').update(patch).eq('id', id).eq('user_id', userId).select(COLS).single());
  },
  async complete(db, userId, id) {
    await OWN.reminder(db, id, userId, 'id');
    const row = unwrap(await db.from('reminders').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select(COLS).single());
    await activityService.log(db, userId, 'reminder_completed', 'reminder', id);
    return row;
  },
  async snooze(db, userId, id, { until, minutes }) {
    await OWN.reminder(db, id, userId, 'id');
    const target = until ? new Date(until) : new Date(Date.now() + minutes * 60000);
    return unwrap(await db.from('reminders').update({ snoozed_until: target.toISOString(), completed: false, completed_at: null }).eq('id', id).eq('user_id', userId).select(COLS).single());
  },
  async remove(db, userId, id) {
    await OWN.reminder(db, id, userId, 'id');
    unwrap(await db.from('reminders').delete().eq('id', id).eq('user_id', userId));
  },
};
