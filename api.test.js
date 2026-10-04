import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, resetStore, rows, seed } from './helpers/fake.js';

vi.mock('../src/config/supabase.js', async () => (await import('./helpers/fake.js')).supabaseMock);
const { createApp } = await import('../src/app.js');
const { setProviderForTests } = await import('../src/services/ai/providers/index.js');
const { createMockProvider } = await import('../src/services/ai/providers/mock.js');

const app = createApp();
const as = (t) => ({ Authorization: `Bearer token-${t}` });
const RESUME_TEXT = `Priya Sharma\npriya@example.com\n+91 98765 43210\n\nSummary\nFrontend developer.\n\nExperience\nFrontend Developer, Acme 2021 - 2024\n- Worked on frontend projects.\n- Built REST APIs with Node.js and PostgreSQL.\n\nEducation\nB.Sc Computer Science\n\nSkills\nReact, JavaScript, SQL, Git\n`;
const JD_TEXT = `Frontend Developer\nWe need React, TypeScript, Docker and REST APIs. 2+ years experience. Bachelor degree.`;

beforeEach(() => { resetStore(); setProviderForTests(createMockProvider()); });

describe('authentication', () => {
  it('rejects requests without a token', async () => {
    const r = await request(app).get('/api/applications');
    expect(r.status).toBe(401); expect(r.body).toEqual({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
  });
  it('rejects an invalid token', async () => expect((await request(app).get('/api/applications').set({ Authorization: 'Bearer nope' })).status).toBe(401));
  it('returns the authenticated user', async () => expect((await request(app).get('/api/auth/me').set(as('A'))).body.data.id).toBe(A));
  it('returns a standard 404 for unknown routes', async () => expect((await request(app).get('/api/nope')).body.error.code).toBe('ROUTE_NOT_FOUND'));
});

describe('applications: CRUD, validation, ownership', () => {
  const create = (t, body = {}) => request(app).post('/api/applications').set(as(t)).send({ company_name: 'Razorpay', job_title: 'Frontend Developer', ...body });

  it('creates an application and the audit event', async () => {
    const r = await create('A', { status: 'applied' });
    expect(r.status).toBe(201); expect(r.body.data.user_id ?? A).toBe(A);
    expect(rows('application_events').some((e) => e.application_id === r.body.data.id && e.event_type === 'created')).toBe(true);
  });
  it('validates input', async () => {
    const r = await create('A', { company_name: '', status: 'ghosted' });
    expect(r.status).toBe(400); expect(r.body.error.code).toBe('VALIDATION_ERROR'); expect(r.body.error.details.length).toBeGreaterThan(0);
  });
  it('paginates with the documented shape', async () => {
    for (let i = 0; i < 3; i++) await create('A', { company_name: `Co ${i}` });
    const r = await request(app).get('/api/applications?page=1&limit=2').set(as('A'));
    expect(r.body.data).toHaveLength(2); expect(r.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });
  it('searches by company', async () => {
    await create('A', { company_name: 'Atlassian' }); await create('A', { company_name: 'Zoho' });
    const r = await request(app).get('/api/applications?q=atlas').set(as('A'));
    expect(r.body.data.map((a) => a.company_name)).toEqual(['Atlassian']);
  });

  it("SECURITY: user B cannot read, edit, move or delete user A's application", async () => {
    const id = (await create('A')).body.data.id;
    for (const [method, path, body] of [['get', `/api/applications/${id}`], ['put', `/api/applications/${id}`, { notes: 'x' }],
      ['patch', `/api/applications/${id}/status`, { status: 'offer' }], ['delete', `/api/applications/${id}`], ['post', `/api/applications/${id}/events`, { event_type: 'note' }]]) {
      const r = await request(app)[method](path).set(as('B')).send(body);
      expect([403, 404]).toContain(r.status);
      expect(JSON.stringify(r.body)).not.toContain('Razorpay'); // never leaks A's data
    }
    expect(rows('applications').find((a) => a.id === id).status).toBe('saved'); // untouched
    expect((await request(app).get('/api/applications').set(as('B'))).body.pagination.total).toBe(0);
    expect((await request(app).get(`/api/applications/${id}`).set(as('A'))).status).toBe(200);
  });
  it("SECURITY: cannot attach another user's resume version or job description", async () => {
    const v = seed('resume_versions', { user_id: A, version_name: 'A v1', content: 'x' });
    const jd = seed('job_descriptions', { user_id: A, raw_text: 'x', text_hash: 'h' });
    expect((await create('B', { resume_version_id: v.id })).status).toBe(404);
    expect((await create('B', { job_description_id: jd.id })).status).toBe(404);
  });
  it('status change writes a timeline event and rejects invalid statuses', async () => {
    const id = (await create('A')).body.data.id;
    const r = await request(app).patch(`/api/applications/${id}/status`).set(as('A')).send({ status: 'interview', note: 'Technical round booked' });
    expect(r.status).toBe(200); expect(r.body.data.status).toBe('interview');
    expect(rows('application_events').find((e) => e.event_type === 'status_changed').description).toBe('Technical round booked');
    expect((await request(app).patch(`/api/applications/${id}/status`).set(as('A')).send({ status: 'nope' })).status).toBe(400);
  });
});

describe('reminders', () => {
  const due = new Date(Date.now() + 86400000).toISOString();
  it('creates, snoozes and completes; B cannot touch them', async () => {
    const c = await request(app).post('/api/reminders').set(as('A')).send({ title: 'Follow up with Acme', type: 'follow_up', due_at: due });
    expect(c.status).toBe(201);
    const id = c.body.data.id;
    expect((await request(app).patch(`/api/reminders/${id}/complete`).set(as('B'))).status).toBe(404);
    const s = await request(app).patch(`/api/reminders/${id}/snooze`).set(as('A')).send({ minutes: 60 });
    expect(s.status).toBe(200); expect(s.body.data.snoozed_until).toBeTruthy();
    expect((await request(app).patch(`/api/reminders/${id}/complete`).set(as('A'))).body.data.completed).toBe(true);
  });
  it('rejects invalid due dates', async () => expect((await request(app).post('/api/reminders').set(as('A')).send({ title: 't', due_at: 'soon' })).status).toBe(400));
});

describe('analytics', () => {
  it('new account: zeros and empty arrays, never NaN', async () => {
    const r = await request(app).get('/api/analytics/overview?range=30d').set(as('A'));
    expect(r.body.data).toMatchObject({ totalApplications: 0, responseRate: 0, interviewRate: 0, offerRate: 0 });
    expect(JSON.stringify(r.body)).not.toMatch(/NaN|Infinity|null/);
  });
  it('computes rates from real rows', async () => {
    for (const status of ['applied', 'screening', 'interview', 'offer']) seed('applications', { user_id: A, company_name: 'X', job_title: 'Y', status });
    seed('applications', { user_id: B, company_name: 'Other', job_title: 'Z', status: 'offer' });
    const d = (await request(app).get('/api/analytics/overview?range=all').set(as('A'))).body.data;
    expect(d).toMatchObject({ totalApplications: 4, responseRate: 75, interviewRate: 50, offerRate: 25 });
  });
});

describe('resume upload validation', () => {
  it('requires a file', async () => expect((await request(app).post('/api/resumes').set(as('A'))).body.error.code).toBe('FILE_REQUIRED'));
  it('rejects executables and mislabeled files', async () => {
    const exe = await request(app).post('/api/resumes').set(as('A')).attach('file', Buffer.from('MZ\x90\x00'), { filename: 'cv.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(415);
    const fake = await request(app).post('/api/resumes').set(as('A')).attach('file', Buffer.from('MZ not a pdf'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(415); expect(rows('resumes')).toHaveLength(0);
  });
});

describe('AI endpoints', () => {
  const setup = () => ({
    resume: seed('resumes', { user_id: A, name: 'Master', parsed_text: RESUME_TEXT }),
    jd: seed('job_descriptions', { user_id: A, raw_text: JD_TEXT, text_hash: 'jdhash1', title: null }),
  });
  it('analyzes with a deterministic score and caches repeat requests (no second AI call)', async () => {
    const { resume, jd } = setup();
    const spy = vi.fn(createMockProvider().completeJSON); setProviderForTests({ ...createMockProvider(), completeJSON: spy });
    const body = { resume_id: resume.id, job_description_id: jd.id };
    const r1 = await request(app).post('/api/ai/analyze-resume').set(as('A')).send(body);
    expect(r1.status).toBe(200); expect(r1.body.data.ats_score).toBeGreaterThan(0); expect(r1.body.data.cached).toBe(false);
    expect(r1.body.data.matched_skills).toContain('react'); expect(r1.body.data.missing_skills.map((s) => s.skill)).toContain('typescript');
    const calls = spy.mock.calls.length;
    const r2 = await request(app).post('/api/ai/analyze-resume').set(as('A')).send(body);
    expect(r2.body.data.cached).toBe(true); expect(r2.body.data.ats_score).toBe(r1.body.data.ats_score); expect(spy.mock.calls.length).toBe(calls);
    const r3 = await request(app).post('/api/ai/analyze-resume').set(as('A')).send({ ...body, force: true });
    expect(r3.body.data.cached).toBe(false);
  });
  it("SECURITY: B cannot analyze A's resume or JD", async () => {
    const { resume, jd } = setup();
    const r = await request(app).post('/api/ai/analyze-resume').set(as('B')).send({ resume_id: resume.id, job_description_id: jd.id });
    expect(r.status).toBe(404);
  });
  it('tailoring creates a NEW version, applies only verbatim changes, never edits the original', async () => {
    const { resume, jd } = setup();
    const base = createMockProvider();
    setProviderForTests({ ...base, completeJSON: async (a) => a.task === 'tailor' ? JSON.stringify({ changes: [
      { original_text: 'Worked on frontend projects.', suggested_text: 'Developed responsive React interfaces and integrated REST APIs.', reason: 'Specific and keyword-rich' },
      { original_text: 'This sentence is not in the resume', suggested_text: 'Invented experience', reason: 'x' }] }) : base.completeJSON(a) });
    const r = await request(app).post('/api/ai/tailor-resume').set(as('A')).send({ resume_id: resume.id, job_description_id: jd.id });
    expect(r.status).toBe(201);
    expect(r.body.data.applied).toHaveLength(1); expect(r.body.data.unapplied).toHaveLength(1);
    expect(r.body.data.version.content).toContain('Developed responsive React interfaces'); expect(r.body.data.version.content).not.toContain('Invented');
    expect(rows('resumes')[0].parsed_text).toBe(RESUME_TEXT);
  });
  it('malformed model output is retried once, then rejected with a clean error (nothing stored)', async () => {
    const { resume, jd } = setup();
    const spy = vi.fn(async () => 'sorry, I cannot help with that'); setProviderForTests({ ...createMockProvider(), completeJSON: spy });
    const r = await request(app).post('/api/ai/analyze-resume').set(as('A')).send({ resume_id: resume.id, job_description_id: jd.id });
    expect(r.status).toBe(502); expect(r.body.error.code).toBe('AI_INVALID_RESPONSE'); expect(spy).toHaveBeenCalledTimes(2); expect(rows('ai_analyses')).toHaveLength(0);
  });
  it('recovers JSON wrapped in code fences', async () => {
    const { resume, jd } = setup(); const base = createMockProvider();
    setProviderForTests({ ...base, completeJSON: async (a) => '```json\n' + (await base.completeJSON(a)) + '\n```' });
    expect((await request(app).post('/api/ai/analyze-resume').set(as('A')).send({ resume_id: resume.id, job_description_id: jd.id })).status).toBe(200);
  });
  it('chat keeps a conversation and protects it from other users', async () => {
    const c1 = await request(app).post('/api/ai/chat').set(as('A')).send({ message: 'How do I follow up?' });
    expect(c1.status).toBe(200); const cid = c1.body.data.conversation_id;
    await request(app).post('/api/ai/chat').set(as('A')).send({ message: 'And after an interview?', conversation_id: cid });
    expect(rows('chat_messages')).toHaveLength(4);
    expect((await request(app).post('/api/ai/chat').set(as('B')).send({ message: 'hi', conversation_id: cid })).status).toBe(404);
    expect((await request(app).get(`/api/ai/conversations/${cid}/messages`).set(as('B'))).status).toBe(404);
  });
  it('validates chat and bullet input', async () => {
    expect((await request(app).post('/api/ai/chat').set(as('A')).send({ message: '' })).status).toBe(400);
    expect((await request(app).post('/api/ai/improve-bullet').set(as('A')).send({})).status).toBe(400);
  });
});
