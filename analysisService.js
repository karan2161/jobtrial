import crypto from 'node:crypto';
import { AppError, badRequest, unwrap } from '../utils/errors.js';
import { activityService } from './activityService.js';
import { aiService } from './aiService.js';
import { jdService } from './jobDescriptionService.js';
import { assertRefs, OWN } from './ownership.js';
import { resumeVersionService } from './resumeVersionService.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Resolve the text to analyse: a tailored version's content, or the master resume's parsed text. */
async function resolveResumeText(db, userId, resume_id, resume_version_id) {
  const resume = await OWN.resume(db, resume_id, userId, 'id, parsed_text');
  if (resume_version_id) {
    const v = await OWN.version(db, resume_version_id, userId, 'id, content, resume_id');
    if (v.resume_id !== resume_id) throw badRequest('VERSION_MISMATCH', 'That version does not belong to this resume.');
    return v.content;
  }
  if (!resume.parsed_text) throw new AppError(422, 'RESUME_HAS_NO_TEXT', 'This resume has no readable text.');
  return resume.parsed_text;
}

export const analysisService = {
  /**
   * Cached by sha256(resume text + JD text). AI is only called when the resume or JD changed,
   * or when the user forces a re-analysis. Every run is stored, so history is preserved.
   */
  async analyzeResume(db, userId, { resume_id, job_description_id, resume_version_id, force }) {
    const text = await resolveResumeText(db, userId, resume_id, resume_version_id);
    const jd = await OWN.jd(db, job_description_id, userId);
    const input_hash = sha(`${text}\n---\n${jd.text_hash}`);

    if (!force) {
      let q = db.from('ai_analyses').select().eq('user_id', userId).eq('resume_id', resume_id).eq('job_description_id', job_description_id).eq('input_hash', input_hash);
      q = resume_version_id ? q.eq('resume_version_id', resume_version_id) : q.is('resume_version_id', null);
      const [hit] = unwrap(await q.order('created_at', { ascending: false }).limit(1));
      if (hit) return { ...hit, cached: true };
    }

    const jdFull = await jdService.ensureAnalysis(db, userId, jd, false);
    const match = aiService.calculateMatch(text, jdFull.analysis);
    const insights = await aiService.analyzeResume({ resumeText: text, jd: jdFull.analysis, match });
    const bullets = insights.bullet_suggestions.filter((b) => text.includes(b.original)); // drop suggestions that don't quote the resume

    const row = unwrap(await db.from('ai_analyses').insert({
      user_id: userId, resume_id, resume_version_id: resume_version_id ?? null, job_description_id, input_hash,
      ats_score: match.score, score_breakdown: match.breakdown,
      matched_skills: match.matchedSkills, missing_skills: match.missingSkills,
      matched_keywords: match.matchedKeywords, missing_keywords: match.missingKeywords,
      experience_match: match.experienceMatch, education_match: match.educationMatch,
      recommendations: insights.recommendations, bullet_suggestions: bullets,
      raw_ai_response: { ...insights, bullet_suggestions: bullets },
    }).select().single());

    if (resume_version_id) unwrap(await db.from('resume_versions').update({ ats_score: match.score }).eq('id', resume_version_id).eq('user_id', userId));
    await activityService.log(db, userId, 'resume_analyzed', 'ai_analysis', row.id, { score: match.score });
    return { ...row, summary: insights.summary, cached: false };
  },

  /** Creates a NEW version; never touches the original. Only verbatim-matching changes are applied. */
  async tailorResume(db, userId, { resume_id, job_description_id, resume_version_id, version_name }) {
    const text = await resolveResumeText(db, userId, resume_id, resume_version_id);
    const jd = await jdService.ensureAnalysis(db, userId, await OWN.jd(db, job_description_id, userId), false);
    const before = aiService.calculateMatch(text, jd.analysis);
    const { changes } = await aiService.tailorResume({ resumeText: text, jd: jd.analysis, match: before });

    let content = text; const applied = [], unapplied = [];
    for (const c of changes) {
      const i = content.indexOf(c.original_text);
      if (i >= 0 && c.original_text !== c.suggested_text) { content = content.slice(0, i) + c.suggested_text + content.slice(i + c.original_text.length); applied.push(c); }
      else unapplied.push(c);
    }
    const after = aiService.calculateMatch(content, jd.analysis);
    const version = await resumeVersionService.create(db, userId, {
      resume_id, job_description_id, parent_version_id: resume_version_id ?? null, content,
      version_name: version_name || [jd.title ?? 'Tailored', jd.company].filter(Boolean).join(' — ').slice(0, 160),
      target_company: jd.company ?? null, target_role: jd.title ?? null,
    }, { ats_score: after.score, changes: applied });
    return { version, scoreBefore: before.score, scoreAfter: after.score, applied, unapplied };
  },

  async improveBullet(db, userId, { bullet, job_description_id, resume_context }) {
    const jd = job_description_id ? (await OWN.jd(db, job_description_id, userId)).analysis : null;
    const out = await aiService.improveBullet({ bullet, jd, resumeContext: resume_context });
    await activityService.log(db, userId, 'bullet_improved', 'bullet', null);
    return { original: bullet, suggested: out.suggested, reason: out.reason };
  },

  async listAnalyses(db, userId, { resume_id, job_description_id }) {
    let q = db.from('ai_analyses').select('id, resume_id, resume_version_id, job_description_id, ats_score, created_at').eq('user_id', userId);
    if (resume_id) q = q.eq('resume_id', resume_id);
    if (job_description_id) q = q.eq('job_description_id', job_description_id);
    return unwrap(await q.order('created_at', { ascending: false }).limit(50));
  },
  getAnalysis: async (db, userId, id) => {
    const row = unwrap(await db.from('ai_analyses').select().eq('id', id).eq('user_id', userId).maybeSingle());
    if (!row) throw new AppError(404, 'ANALYSIS_NOT_FOUND', 'Analysis not found.');
    return row;
  },
};

export const chatService = {
  async listConversations(db, userId) {
    return unwrap(await db.from('chat_conversations').select('id, title, resume_id, application_id, job_description_id, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(50));
  },
  async messages(db, userId, id) {
    await assertConversation(db, userId, id);
    return unwrap(await db.from('chat_messages').select('id, role, content, created_at').eq('conversation_id', id).eq('user_id', userId).order('created_at').limit(200));
  },
  async removeConversation(db, userId, id) {
    await assertConversation(db, userId, id);
    unwrap(await db.from('chat_conversations').delete().eq('id', id).eq('user_id', userId));
  },

  async chat(db, userId, { message, conversation_id, ...ctx }) {
    await assertRefs(db, userId, ctx);
    let conv = conversation_id ? await assertConversation(db, userId, conversation_id) : null;
    const ids = { resume_id: ctx.resume_id ?? conv?.resume_id ?? null, application_id: ctx.application_id ?? conv?.application_id ?? null, job_description_id: ctx.job_description_id ?? conv?.job_description_id ?? null };
    if (!conv) conv = unwrap(await db.from('chat_conversations').insert({ user_id: userId, title: message.slice(0, 60), ...ids }).select().single());

    const history = unwrap(await db.from('chat_messages').select('role, content').eq('conversation_id', conv.id).eq('user_id', userId).order('created_at', { ascending: false }).limit(20)).reverse();
    const context = await buildContext(db, userId, ids);
    const reply = await aiService.careerAssistant({ history, message, context });

    unwrap(await db.from('chat_messages').insert([
      { conversation_id: conv.id, user_id: userId, role: 'user', content: message },
      { conversation_id: conv.id, user_id: userId, role: 'assistant', content: reply },
    ]));
    unwrap(await db.from('chat_conversations').update({ updated_at: new Date().toISOString(), ...ids }).eq('id', conv.id).eq('user_id', userId));
    await activityService.log(db, userId, 'ai_assistant_used', 'conversation', conv.id);
    return { conversation_id: conv.id, message: { role: 'assistant', content: reply } };
  },
};

async function assertConversation(db, userId, id) {
  const c = unwrap(await db.from('chat_conversations').select().eq('id', id).eq('user_id', userId).maybeSingle());
  if (!c) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  return c;
}

/** Assemble only the user's own, already-authorised data as assistant context. */
async function buildContext(db, userId, { resume_id, application_id, job_description_id }) {
  const parts = [];
  let jdId = job_description_id;
  if (application_id) {
    const a = await OWN.application(db, application_id, userId, 'company_name, job_title, status, application_date, notes, job_description_id, resume_id');
    parts.push(`APPLICATION: ${a.job_title} at ${a.company_name}; status ${a.status}; applied ${a.application_date ?? 'not yet'}; notes: ${(a.notes ?? '').slice(0, 800) || 'none'}`);
    jdId ??= a.job_description_id; resume_id ??= a.resume_id;
  }
  if (jdId) {
    const j = await OWN.jd(db, jdId, userId, 'title, company, raw_text, analysis');
    parts.push(`JOB DESCRIPTION (${j.title ?? 'untitled'}${j.company ? ` at ${j.company}` : ''}):\n${j.raw_text.slice(0, 4000)}`);
  }
  if (resume_id) {
    const r = await OWN.resume(db, resume_id, userId, 'parsed_text');
    parts.push(`RESUME:\n${(r.parsed_text ?? '').slice(0, 6000)}`);
    if (jdId) {
      const [a] = unwrap(await db.from('ai_analyses').select('ats_score, missing_skills, missing_keywords').eq('user_id', userId).eq('resume_id', resume_id).eq('job_description_id', jdId).order('created_at', { ascending: false }).limit(1));
      if (a) parts.push(`LATEST ATS ANALYSIS: score ${a.ats_score}/100; missing skills: ${a.missing_skills.map((s) => s.skill).join(', ') || 'none'}; missing keywords: ${a.missing_keywords.join(', ') || 'none'}`);
    }
  }
  return parts.join('\n\n');
}
