import { findSkills, normalize } from '../../../utils/skills.js';

// OFFLINE HEURISTIC PROVIDER: for automated tests and UI work without an API key.
// It is NOT AI: it extracts dictionary skills with regexes. Blocked when NODE_ENV=production.
export function createMockProvider() {
  const between = (s, tag) => s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
  return {
    name: 'mock',
    async completeJSON({ task, user }) {
      if (task === 'extract_jd') {
        const text = between(user, 'job_description');
        const skills = findSkills(normalize(text));
        const years = text.match(/(\d{1,2})\+?\s*years/i);
        return JSON.stringify({
          title: text.split('\n')[0].slice(0, 100) || null, requiredSkills: skills.slice(0, 8), preferredSkills: skills.slice(8, 12),
          keywords: skills, responsibilities: [], minYearsExperience: years ? +years[1] : null,
          educationLevel: /bachelor|b\.?tech|b\.?sc/i.test(text) ? 'bachelor' : null,
        });
      }
      if (task === 'insights') return JSON.stringify({ summary: 'Offline heuristic summary.', recommendations: [{ problem: 'Missing required skills', why_it_matters: 'ATS filters on required keywords.', suggestion: 'Add the missing skills where you have genuinely used them.', priority: 'high' }], bullet_suggestions: [] });
      if (task === 'tailor') return JSON.stringify({ changes: [] });
      if (task === 'bullet') return JSON.stringify({ suggested: 'Offline mock: rewrite this bullet with a measurable result.', reason: 'Quantified impact reads stronger.' });
      return '{}';
    },
    async chat() { return 'This is an offline mock reply (AI_PROVIDER=mock).'; },
  };
}
