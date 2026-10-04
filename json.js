/** Recover a JSON object from model output: strips code fences and surrounding prose. Returns undefined on failure. */
export function parseModelJson(raw) {
  if (typeof raw !== 'string') return undefined;
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through to brace extraction */ }
  const start = t.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return undefined; } }
  }
  return undefined;
}
