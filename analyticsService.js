import { unwrap } from '../utils/errors.js';
import { activityService } from './activityService.js';
import { applicationService } from './applicationService.js';
import { interviewService } from './interviewService.js';
import { reminderService } from './reminderService.js';

const DAYS = { '7d': 7, '30d': 30, '90d': 90, all: null };

/** Safe division: 0 denominators return 0, never NaN/Infinity. Rounded to 1 decimal place, as a percentage. */
export const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * Metric definitions (denominator = submitted applications, i.e. status != 'saved'):
 *   responseRate  = applications that received any response (screening/interview/offer/rejected)
 *   interviewRate = applications that reached the interview stage at any point
 *   offerRate     = applications that reached an offer at any point
 */
export function shapeOverview(raw) {
  const submitted = Number(raw.submitted) || 0;
  return {
    totalApplications: Number(raw.totalApplications) || 0,
    activeApplications: Number(raw.activeApplications) || 0,
    submittedApplications: submitted,
    interviews: Number(raw.interviews) || 0,
    offers: Number(raw.offers) || 0,
    rejections: Number(raw.rejections) || 0,
    responseRate: rate(raw.responded, submitted),
    interviewRate: rate(raw.interviews, submitted),
    offerRate: rate(raw.offers, submitted),
    applicationsOverTime: raw.applicationsOverTime ?? [],
    applicationsByStatus: raw.applicationsByStatus ?? [],
    applicationsByRole: raw.applicationsByRole ?? [],
    applicationsByCompany: raw.applicationsByCompany ?? [],
  };
}

export const analyticsService = {
  async overview(db, range = 'all') {
    const raw = unwrap(await db.rpc('analytics_overview', { p_days: DAYS[range] }));
    return { range, ...shapeOverview(raw ?? {}) };
  },
  /** One call for the dashboard: real numbers only. New accounts get zeros + empty arrays (frontend shows empty states). */
  async dashboard(db, userId, range = '30d') {
    const [overview, recent, reminders, interviews, activity] = await Promise.all([
      this.overview(db, range),
      applicationService.list(db, userId, { page: 1, limit: 5, sort: 'created_at', order: 'desc' }),
      reminderService.summary(db, userId, 5),
      interviewService.upcoming(db, userId, 3),
      activityService.recent(db, userId, 8),
    ]);
    return { overview, recentApplications: recent.data, reminders, upcomingInterviews: interviews, recentActivity: activity, isEmpty: overview.totalApplications === 0 };
  },
};
