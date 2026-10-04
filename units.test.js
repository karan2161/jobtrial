import { describe, expect, it } from 'vitest';
import { scoreMatch, DEFAULT_WEIGHTS } from '../src/services/atsService.js';
import { estimateYears, parseResumeText, splitSections } from '../src/services/resumeParserService.js';
import { parseModelJson } from '../src/services/ai/json.js';
import { rate, shapeOverview } from '../src/services/analyticsService.js';
import { diffLines } from '../src/utils/diff.js';

const RESUME = `Priya Sharma\npriya@example.com\n+91 98765 43210\n\nSummary\nFrontend developer.\n\nExperience\nFrontend Developer, Acme 2021 - 2024\n- Built React apps and REST APIs on PostgreSQL.\n\nEducation\nB.Tech Computer Science\n\nSkills\nReact, JavaScript, SQL, Git\n`;
const jd = (o = {}) => ({ title: 'Frontend Developer', requiredSkills: ['React', 'TypeScript', 'REST APIs'], preferredSkills: ['Docker'], keywords: ['react', 'typescript'], responsibilities: [], minYearsExperience: 2, educationLevel: 'bachelor', ...o });

describe('ATS scoring', () => {
  it('is deterministic and explains matched/missing skills', () => {
    const a = scoreMatch({ resumeText: RESUME, jd: jd() }), b = scoreMatch({ resumeText: RESUME, jd: jd() });
    expect(a).toEqual(b);
    expect(a.matchedSkills).toEqual(expect.arrayContaining(['react', 'rest apis']));
    expect(a.missingSkills).toEqual([{ skill: 'typescript', importance: 'required' }, { skill: 'docker', importance: 'preferred' }]);
    expect(a.score).toBeGreaterThan(0); expect(a.score).toBeLessThanOrEqual(100);
  });
  it('matches skill aliases (postgres = PostgreSQL, ReactJS = React)', () => {
    const r = scoreMatch({ resumeText: 'I use Postgres and ReactJS daily. ' + RESUME, jd: jd({ requiredSkills: ['PostgreSQL', 'React'], preferredSkills: [], keywords: [] }) });
    expect(r.missingSkills).toEqual([]);
  });
  it('adding a missing skill raises the score', () => {
    const before = scoreMatch({ resumeText: RESUME, jd: jd() }).score;
    const after = scoreMatch({ resumeText: RESUME + '\nTypeScript, Docker', jd: jd() }).score;
    expect(after).toBeGreaterThan(before);
  });
  it('does not penalise components the job description does not specify', () => {
    const r = scoreMatch({ resumeText: RESUME, jd: jd({ minYearsExperience: null, educationLevel: null, keywords: [] }) });
    expect(r.breakdown.experience.applicable).toBe(false); expect(r.breakdown.education.applicable).toBe(false);
  });
  it('handles an empty job description without NaN', () => {
    const r = scoreMatch({ resumeText: RESUME, jd: { title: null, requiredSkills: [], preferredSkills: [], keywords: [], responsibilities: [], minYearsExperience: null, educationLevel: null } });
    expect(Number.isFinite(r.score)).toBe(true);
  });
  it('weights are configurable', () => {
    const skillsOnly = scoreMatch({ resumeText: RESUME, jd: jd(), weights: { ...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, 0])), skills: 1 } });
    expect(Math.abs(skillsOnly.score - skillsOnly.breakdown.skills.score)).toBeLessThan(1);
  });
});

describe('resume parser', () => {
  it('extracts contact info, skills, sections and experience', () => {
    const p = parseResumeText(RESUME);
    expect(p).toMatchObject({ name: 'Priya Sharma', email: 'priya@example.com', educationLevel: 'bachelor' });
    expect(p.skills).toEqual(expect.arrayContaining(['react', 'javascript', 'sql'])); expect(p.sectionsPresent).toEqual(expect.arrayContaining(['experience', 'education', 'skills']));
    expect(p.yearsExperience).toBe(3);
  });
  it('splits sections and estimates years', () => { expect(Object.keys(splitSections('Experience\nx\nEducation\ny'))).toEqual(['experience', 'education']); expect(estimateYears('5+ years of experience')).toBe(5); });
});

describe('utilities', () => {
  it('parseModelJson recovers fenced / prefixed JSON and rejects garbage', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Sure! Here you go: {"a":{"b":"}"}} thanks')).toEqual({ a: { b: '}' } });
    expect(parseModelJson('no json here')).toBeUndefined();
  });
  it('rate() never returns NaN/Infinity', () => { expect(rate(1, 0)).toBe(0); expect(rate(1, 3)).toBe(33.3); });
  it('shapeOverview handles empty input', () => expect(shapeOverview({})).toMatchObject({ totalApplications: 0, responseRate: 0, applicationsOverTime: [] }));
  it('diffLines reports added, removed and modified lines', () => {
    const d = diffLines('a\nold\nc', 'a\nnew\nc\nd');
    expect(d.summary).toEqual({ added: 1, removed: 0, modified: 1 });
  });
});
