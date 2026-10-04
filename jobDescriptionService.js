import crypto from 'node:crypto';
import { unwrap } from '../utils/errors.js';
import { activityService } from './activityService.js';
import { aiService } from './aiService.js';
import { OWN } from './ownership.js';

const hash = (t) => crypto.createHash('sha256').update(t.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex');
export const jdService = {
  hash,
  async list(db, userId) {
    return unwrap(await db.from('job_descriptions').select('id, title, company, source_url, location, salary, extracted_skills, created_at, updated_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100));
  },
  get: (db, userId, id) => OWN.jd(db, id, userId),
  async create(db, userId, body) {
    const { title, company, source_url, location, salary, raw_text } = body;
    return unwrap(await db.from('job_descriptions').insert({
      title, company, source_url, location, salary, raw_text,
      user_id: userId,
      text_hash: hash(raw_text),
    }).select().single());
  },
  async update(db, userId, id, body) {
    await OWN.jd(db, id, userId, 'id');
    const patch = { ...body };
    if (body.raw_text) Object.assign(patch, { text_hash: hash(body.raw_text), analysis: null, extracted_skills: [], extracted_keywords: [] }); // text changed: old extraction is stale
    return unwrap(await db.from('job_descriptions').update(patch).eq('id', id).eq('user_id', userId).select().single());
  },
  async remove(db, userId, id) {
    await OWN.jd(db, id, userId, 'id');
    unwrap(await db.from('job_descriptions').delete().eq('id', id).eq('user_id', userId));
  },

  /** Save (or reuse) a JD and extract requirements with AI. Cached by text hash: no repeat AI calls for unchanged text. */
  async analyze(db, userId, body) {
    let jd;
    if (body.job_description_id) jd = await OWN.jd(db, body.job_description_id, userId);
    else {
      const [existing] = unwrap(await db.from('job_descriptions').select().eq('user_id', userId).eq('text_hash', hash(body.raw_text)).limit(1));
      jd = existing ?? (await this.create(db, userId, body));
    }
    return this.ensureAnalysis(db, userId, jd, body.force);
  },
  async ensureAnalysis(db, userId, jd, force = false) {
    if (jd.analysis && !force) return jd;
    const analysis = await aiService.analyzeJobDescription(jd.raw_text);
    const saved = unwrap(await db.from('job_descriptions').update({
      analysis, title: jd.title ?? analysis.title,
      extracted_skills: [...analysis.requiredSkills, ...analysis.preferredSkills], extracted_keywords: analysis.keywords,
    }).eq('id', jd.id).eq('user_id', userId).select().single());
    await activityService.log(db, userId, 'job_description_analyzed', 'job_description', jd.id);
    return saved;
  },
};
