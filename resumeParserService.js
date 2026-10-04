import { createRequire } from 'node:module';
import mammoth from 'mammoth';
import { AppError } from '../utils/errors.js';
import { findSkills, normalize } from '../utils/skills.js';

const require = createRequire(import.meta.url);
const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Detect real type from magic bytes (never trust the client-supplied mimetype alone). */
export function detectFileType(buf, originalName = '', mimetype = '') {
  const ext = originalName.toLowerCase().split('.').pop();
  const isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (isPdf && ext === 'pdf' && mimetype === MIME.pdf) return 'pdf';
  if (isZip && ext === 'docx' && mimetype === MIME.docx) return 'docx';
  throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF and DOCX resumes are supported.');
}
export const mimeFor = (type) => MIME[type];

export async function extractText(buf, type) {
  try {
    let text = '';
    if (type === 'pdf') {
      const pdf = require('pdf-parse/lib/pdf-parse.js'); // avoids pdf-parse's debug-mode entrypoint
      text = (await pdf(buf)).text;
    } else {
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    }
    text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 80) {
      throw new AppError(422, 'RESUME_UNREADABLE', 'We could not read text from this file. Scanned/image-only resumes are not supported yet; export a text-based PDF or DOCX.');
    }
    return text.slice(0, 60000);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(422, 'RESUME_PARSE_FAILED', 'This file could not be parsed. It may be corrupted or password-protected.');
  }
}

const SECTIONS = {
  summary: /^(professional\s+)?(summary|profile|objective|about me)$/i,
  experience: /^(work\s+|professional\s+)?(experience|employment( history)?|internships?)$/i,
  education: /^education( and training)?$/i,
  skills: /^(technical\s+|key\s+)?skills( & tools| and tools)?$/i,
  projects: /^(personal\s+|academic\s+)?projects$/i,
  certifications: /^(certifications?|licenses?|courses?)( & awards)?$/i,
};

export function splitSections(text) {
  const out = {}; let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/[:\-–—]+$/, '').trim();
    const key = line.length < 40 && Object.keys(SECTIONS).find((k) => SECTIONS[k].test(line));
    if (key) { cur = key; out[cur] = ''; continue; }
    if (cur) out[cur] += raw + '\n';
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
}

export function estimateYears(text) {
  const now = new Date().getFullYear();
  let earliest = Infinity, latest = 0;
  for (const m of text.matchAll(/\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)\b/gi)) {
    const s = +m[1], e = /^\d/.test(m[2]) ? +m[2] : now;
    if (s <= e && s > 1970) { earliest = Math.min(earliest, s); latest = Math.max(latest, e); }
  }
  const span = latest ? latest - earliest : 0;
  const stated = Math.max(0, ...[...text.matchAll(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi)].map((m) => +m[1]));
  const years = Math.max(span, stated);
  return years > 0 && years <= 45 ? years : null;
}

export function educationLevel(text) {
  const t = normalize(text);
  if (/\b(ph\.?d|doctorate)\b/.test(t)) return 'phd';
  if (/\b(master|m\.?sc|m\.?tech|mca|mba|m\.?s)\b/.test(t)) return 'master';
  if (/\b(bachelor|b\.?sc|b\.?tech|b\.?e|bca|b\.?com|b\.?a)\b/.test(t)) return 'bachelor';
  if (/\bdiploma\b/.test(t)) return 'diploma';
  return null;
}

/** Deterministic structured extraction. No AI, no network. */
export function parseResumeText(text) {
  const sections = splitSections(text);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)\d{3,5}[\s-]?\d{3,5}/)?.[0]?.trim() ?? null;
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const name = /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(firstLine) && !/@|\d/.test(firstLine) ? firstLine : null;
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    name, email, phone,
    skills: findSkills(normalize(text)),
    sections,
    sectionsPresent: Object.keys(sections),
    yearsExperience: estimateYears(sections.experience ?? text),
    educationLevel: educationLevel(sections.education ?? text),
    wordCount: words,
    hasBullets: /^\s*[•▪●\-*]\s+/m.test(text),
    summary: sections.summary?.slice(0, 600) ?? null,
  };
}
