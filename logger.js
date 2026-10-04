// Minimal structured logger with redaction. Never logs tokens, passwords, keys or resume/JD text.
const SENSITIVE = /authorization|password|token|secret|api[-_]?key|parsed_text|raw_text|content|resume_context|message/i;
const redact = (v, depth = 0) => {
  if (v == null || depth > 4) return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, SENSITIVE.test(k) ? '[redacted]' : redact(val, depth + 1)]));
  }
  return v;
};
const write = (level, msg, meta) => {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...redact(meta) });
  (level === 'error' ? console.error : console.log)(line);
};
export const logger = {
  info: (m, x) => write('info', m, x),
  warn: (m, x) => write('warn', m, x),
  error: (m, x) => write('error', m, x),
};
