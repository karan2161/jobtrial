import { env } from '../config/env.js';
import { canonicalSkill, containsTerm, normalize, skillPresent } from '../utils/skills.js';
import { parseResumeText } from './resumeParserService.js';

/**
 * Deterministic ATS scoring. The AI only EXTRACTS requirements from the job description
 * (and later explains the result). Matching and scoring happen here, in code, so the score
 * cannot be inflated or invented by a model, and identical inputs always give identical scores.
 */
export const DEFAULT_WEIGHTS = { keywords: 0.25, skills: 0.30, experience: 0.15, education: 0.05, role: 0.10, structure: 0.15 };
const EDU_RANK = { diploma: 1, bachelor: 2, master: 3, phd: 4 };
const STOP = new Set(['senior', 'junior', 'sr', 'jr', 'the', 'and', 'of', 'ii', 'iii', 'i', 'lead', 'staff', 'intern']);

export function getWeights() {
  if (!env.ATS_WEIGHTS) return DEFAULT_WEIGHTS;
  try {
    const w = JSON.parse(env.ATS_WEIGHTS);
    const ok = Object.keys(DEFAULT_WEIGHTS).every((k) => typeof w[k] === 'number' && w[k] >= 0);
    return ok ? w : DEFAULT_WEIGHTS;
  } catch { return DEFAULT_WEIGHTS; }
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const ratio = (a, b) => (b > 0 ? a / b : 0); // safe division: never NaN/Infinity

function structureScore(p) {
  const core = ['experience', 'education', 'skills'];
  const sec = (core.filter((s) => p.sectionsPresent.includes(s)).length + (p.sectionsPresent.includes('summary') || p.sectionsPresent.includes('projects') ? 1 : 0)) / 4;
  const contact = ((p.email ? 1 : 0) + (p.phone ? 1 : 0)) / 2;
  const bullets = p.hasBullets ? 1 : 0;
  const w = p.wordCount;
  const length = w >= 250 && w <= 1000 ? 1 : w < 250 ? clamp01(w / 250) : clamp01(1 - (w - 1000) / 1000);
  return sec * 0.5 + contact * 0.2 + bullets * 0.15 + length * 0.15;
}

/**
 * @param resumeText  plain text of the resume/version being scored
 * @param jd          validated extraction: {title, requiredSkills[], preferredSkills[], keywords[], minYearsExperience, educationLevel}
 */
export function scoreMatch({ resumeText, jd, weights = getWeights() }) {
  const norm = normalize(resumeText);
  const profile = parseResumeText(resumeText);
  const parts = {};

  // required skills count fully, preferred skills half
  const req = [...new Set(jd.requiredSkills.map((s) => canonicalSkill(s).name))];
  const pref = [...new Set(jd.preferredSkills.map((s) => canonicalSkill(s).name))].filter((s) => !req.includes(s));
  const matchedSkills = [], missingSkills = [];
  for (const s of req) (skillPresent(norm, s) ? matchedSkills : missingSkills).push({ skill: s, importance: 'required' });
  for (const s of pref) (skillPresent(norm, s) ? matchedSkills : missingSkills).push({ skill: s, importance: 'preferred' });
  const wt = (x) => (x.importance === 'required' ? 1 : 0.5);
  const totalW = [...req.map(() => 1), ...pref.map(() => 0.5)].reduce((a, b) => a + b, 0);
  parts.skills = { applicable: totalW > 0, score: ratio(matchedSkills.reduce((a, x) => a + wt(x), 0), totalW),
    detail: { matched: matchedSkills.length, total: req.length + pref.length } };

  const kws = [...new Set(jd.keywords.map(normalize).filter(Boolean))];
  const matchedKeywords = kws.filter((k) => containsTerm(norm, k));
  const missingKeywords = kws.filter((k) => !matchedKeywords.includes(k));
  parts.keywords = { applicable: kws.length > 0, score: ratio(matchedKeywords.length, kws.length), detail: { matched: matchedKeywords.length, total: kws.length } };

  const need = jd.minYearsExperience, have = profile.yearsExperience;
  parts.experience = { applicable: need != null && need > 0, score: have == null ? 0 : clamp01(ratio(have, need)), detail: { requiredYears: need ?? null, detectedYears: have } };

  const needEdu = jd.educationLevel, haveEdu = profile.educationLevel;
  parts.education = { applicable: !!needEdu, score: !needEdu ? 0 : !haveEdu ? 0 : clamp01(ratio(EDU_RANK[haveEdu], EDU_RANK[needEdu])), detail: { required: needEdu ?? null, detected: haveEdu } };

  const titleTokens = normalize(jd.title || '').split(' ').filter((t) => t.length > 1 && !STOP.has(t));
  const phrase = normalize(jd.title || '');
  const roleScore = !titleTokens.length ? 0 : phrase && containsTerm(norm, phrase) ? 1 : ratio(titleTokens.filter((t) => containsTerm(norm, t)).length, titleTokens.length);
  parts.role = { applicable: titleTokens.length > 0, score: roleScore, detail: { title: jd.title ?? null } };

  parts.structure = { applicable: true, score: structureScore(profile), detail: { sections: profile.sectionsPresent, words: profile.wordCount, hasContact: !!(profile.email || profile.phone) } };

  // weighted sum over applicable parts; weights renormalised so N/A parts don't drag the score down
  let sum = 0, wsum = 0;
  const breakdown = {};
  for (const [k, p] of Object.entries(parts)) {
    const w = weights[k] ?? 0;
    breakdown[k] = { ...p, score: Math.round(p.score * 100), weight: w };
    if (p.applicable && w > 0) { sum += p.score * w; wsum += w; }
  }
  const score = wsum > 0 ? Math.round(clamp01(sum / wsum) * 1000) / 10 : 0;

  return {
    score, breakdown,
    matchedSkills: matchedSkills.map((s) => s.skill), missingSkills,
    matchedKeywords, missingKeywords,
    experienceMatch: { ...parts.experience.detail, met: parts.experience.applicable ? parts.experience.score >= 1 : null },
    educationMatch: { ...parts.education.detail, met: parts.education.applicable ? parts.education.score >= 1 : null },
    resumeProfile: { yearsExperience: profile.yearsExperience, educationLevel: profile.educationLevel, sectionsPresent: profile.sectionsPresent },
  };
}
