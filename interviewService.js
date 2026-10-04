import { unwrap } from '../utils/errors.js';
import { activityService } from './activityService.js';
import { OWN } from './ownership.js';

export const interviewService = {
  async listForApplication(db, userId, appId) {
    await OWN.application(db, appId, userId, 'id');
    return unwrap(await db.from('interviews').select().eq('application_id', appId).eq('user_id', userId).order('scheduled_at'));
  },
  /** Upcoming interviews across all applications (dashboard). */
  async upcoming(db, userId, limit = 5) {
    return unwrap(await db.from('interviews').select('*, application:applications(id, company_name, job_title)').eq('user_id', userId)
      .eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(limit));
  },
  async create(db, userId, appId, body) {
    const app = await OWN.application(db, appId, userId, 'id, company_name, job_title');
    const { create_reminder, reminder_minutes_before, ...fields } = body;
    const row = unwrap(await db.from('interviews').insert({ ...fields, application_id: appId, user_id: userId }).select().single());
    if (create_reminder) {
      const due = new Date(new Date(row.scheduled_at).getTime() - reminder_minutes_before * 60000);
      if (due > new Date()) unwrap(await db.from('reminders').insert({ user_id: userId, application_id: appId, type: 'interview',
        title: `${app.company_name}: ${row.interview_type} interview`, description: `${app.job_title}`, due_at: due.toISOString() }));
    }
    await activityService.log(db, userId, 'interview_created', 'interview', row.id, { application_id: appId, type: row.interview_type });
    return row;
  },
  async update(db, userId, id, body) {
    await OWN.interview(db, id, userId, 'id');
    return unwrap(await db.from('interviews').update(body).eq('id', id).eq('user_id', userId).select().single());
  },
  async remove(db, userId, id) {
    await OWN.interview(db, id, userId, 'id');
    unwrap(await db.from('interviews').delete().eq('id', id).eq('user_id', userId));
  },
};
