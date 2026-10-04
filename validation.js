import { z } from 'zod';

// Strip control characters (keeps \n and \t), trim, bound length. JSON output is not HTML-escaped:
// the frontend must render user text as text (React does this by default), never as raw HTML.
const clean = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
export const text = (max = 255) => z.string().transform(clean).pipe(z.string().max(max));
export const reqText = (max = 255) => z.string().transform(clean).pipe(z.string().min(1, 'Required').max(max));
const emptyToNull = (schema) => z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());
export const optText = (max = 255) => emptyToNull(text(max));
export const uuid = z.string().uuid();
export const optUuid = emptyToNull(uuid);
export const url = emptyToNull(z.string().trim().max(2048).url().refine((u) => /^https?:\/\//i.test(u), 'Must be http(s)'));
export const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
export const dateOnly = emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'));

export const STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'];
export const status = z.enum(STATUSES);
export const workMode = emptyToNull(z.enum(['remote', 'hybrid', 'onsite']));

export const idParams = z.object({ id: uuid });
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export const stripUndefined = strip;

// ---- profiles ----
export const profileUpdate = z.object({
  full_name: optText(120), professional_title: optText(120), location: optText(120),
  experience_level: optText(60), primary_field: optText(120), desired_role: optText(120),
  preferred_location: optText(120), work_mode: workMode, avatar_url: url,
}).strict();

// ---- auth ----
const password = z.string().min(8).max(128);
export const signupBody = z.object({ email: z.string().email().max(254), password, full_name: optText(120) });
export const loginBody = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
export const forgotBody = z.object({ email: z.string().email() });
export const resetBody = z.object({ password });
export const refreshBody = z.object({ refresh_token: z.string().min(10).max(4096) });

// ---- resumes ----
export const resumeUpdate = z.object({ name: reqText(120) }).strict();

// ---- resume versions ----
export const versionCreate = z.object({
  resume_id: uuid, version_name: reqText(160), content: z.string().min(1).max(60000),
  job_description_id: optUuid, parent_version_id: optUuid, target_company: optText(160), target_role: optText(160),
});
export const versionUpdate = z.object({
  version_name: reqText(160).optional(), content: z.string().min(1).max(60000).optional(),
  target_company: optText(160), target_role: optText(160), job_description_id: optUuid,
}).strict();
export const versionListQuery = z.object({ resume_id: uuid.optional() });
export const compareQuery = z.object({ against: uuid.optional() });

// ---- job descriptions ----
export const jdCreate = z.object({
  title: optText(200), company: optText(200), source_url: url, location: optText(160), salary: optText(120),
  raw_text: z.string().transform(clean).pipe(z.string().min(50, 'Job description is too short').max(20000)),
});
export const jdUpdate = jdCreate.partial().strict();
export const jdAnalyze = jdCreate.extend({ job_description_id: uuid.optional(), force: z.boolean().default(false) })
  .partial({ raw_text: true }).refine((b) => b.raw_text || b.job_description_id, { message: 'Provide raw_text or job_description_id' });

// ---- applications ----
const appFields = {
  company_name: reqText(200), job_title: reqText(200), company_logo_url: url, job_url: url,
  location: optText(160), salary: optText(120), work_mode: workMode, status: status,
  application_date: dateOnly, job_description_id: optUuid, resume_id: optUuid, resume_version_id: optUuid, notes: optText(5000),
};
export const applicationCreate = z.object({
  ...appFields, status: status.default('saved'),
  create_follow_up_reminder: z.boolean().default(false),
});
export const applicationUpdate = z.object(appFields).partial().strict();
export const applicationStatusBody = z.object({ status, note: optText(500) });
export const applicationListQuery = pageQuery.extend({
  q: z.string().max(100).optional(), status: status.optional(),
  sort: z.enum(['created_at', 'application_date', 'company_name', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export const eventBody = z.object({
  event_type: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use snake_case, e.g. hr_contacted'),
  description: optText(1000),
});

// ---- interviews ----
export const interviewFields = {
  interview_type: z.enum(['phone', 'video', 'technical', 'hr', 'final', 'other']), scheduled_at: isoDate,
  duration: z.number().int().min(5).max(600).nullable().optional(), meeting_url: url, location: optText(200),
  notes: optText(5000), status: z.enum(['scheduled', 'completed', 'cancelled']),
};
export const interviewCreate = z.object({ ...interviewFields, interview_type: interviewFields.interview_type.default('other'),
  status: interviewFields.status.default('scheduled'), create_reminder: z.boolean().default(false),
  reminder_minutes_before: z.number().int().min(5).max(10080).default(60) });
export const interviewUpdate = z.object(interviewFields).partial().strict();

// ---- reminders ----
export const reminderCreate = z.object({
  application_id: optUuid, type: z.enum(['follow_up', 'interview', 'deadline', 'custom']).default('custom'),
  title: reqText(200), description: optText(2000), due_at: isoDate,
});
export const reminderUpdate = z.object({
  application_id: optUuid, type: z.enum(['follow_up', 'interview', 'deadline', 'custom']).optional(),
  title: reqText(200).optional(), description: optText(2000), due_at: isoDate.optional(),
}).strict();
export const snoozeBody = z.object({ until: isoDate.optional(), minutes: z.number().int().min(5).max(60 * 24 * 30).optional() })
  .refine((b) => b.until || b.minutes, { message: 'Provide until or minutes' });
export const reminderListQuery = pageQuery.extend({ filter: z.enum(['all', 'upcoming', 'overdue', 'today']).default('upcoming'), application_id: uuid.optional() });

// ---- analytics / activity ----
export const analyticsQuery = z.object({ range: z.enum(['7d', '30d', '90d', 'all']).default('30d') });
export const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

// ---- AI ----
export const analyzeResumeBody = z.object({ resume_id: uuid, job_description_id: uuid, resume_version_id: uuid.optional(), force: z.boolean().default(false) });
export const tailorBody = z.object({ resume_id: uuid, job_description_id: uuid, resume_version_id: uuid.optional(), version_name: optText(160) });
export const bulletBody = z.object({ bullet: reqText(600), job_description_id: uuid.optional(), resume_context: text(4000).optional() });
export const chatBody = z.object({
  message: z.string().transform(clean).pipe(z.string().min(1).max(4000)),
  conversation_id: uuid.optional(), resume_id: uuid.optional(), application_id: uuid.optional(), job_description_id: uuid.optional(),
});
export const analysesQuery = z.object({ resume_id: uuid.optional(), job_description_id: uuid.optional() });
