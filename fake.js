import { randomUUID } from 'node:crypto';

// In-memory stand-in for Supabase: supports the query-builder subset the services use.
// It does NOT simulate RLS on purpose, so these tests prove the API's own ownership checks
// hold even if a database policy were misconfigured. (RLS is the second, independent layer.)
export const USERS = { 'token-A': { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@test.dev' }, 'token-B': { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'b@test.dev' } };
export const A = USERS['token-A'].id, B = USERS['token-B'].id;
export const store = { tables: {} };
export const resetStore = () => { store.tables = {}; };
export const seed = (table, row) => { const r = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }; (store.tables[table] ??= []).push(r); return r; };
export const rows = (t) => store.tables[t] ?? [];

class Q {
  constructor(t, uid) { this.t = t; this.uid = uid; this.f = []; this.mode = 'select'; this.orders = []; }
  select(_c, o) { if (this.mode === 'select') this.opt = o; else this.returning = true; return this; }
  insert(v) { this.mode = 'insert'; this.v = v; return this; }
  update(v) { this.mode = 'update'; this.v = v; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  is(k, v) { this.f.push((r) => (r[k] ?? null) === v); return this; }
  in(k, vs) { this.f.push((r) => vs.includes(r[k])); return this; }
  gte(k, v) { this.f.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.f.push((r) => r[k] <= v); return this; }
  lt(k, v) { this.f.push((r) => r[k] < v); return this; }
  or(expr) {
    const conds = expr.split(',').map((c) => { const [k, op, ...rest] = c.split('.'); const val = rest.join('.'); return (r) => op === 'eq' ? r[k] === val : String(r[k] ?? '').toLowerCase().includes(val.replace(/%/g, '').toLowerCase()); });
    this.f.push((r) => conds.some((c) => c(r))); return this;
  }
  order(k, o = {}) { if (!o.referencedTable) this.orders.push([k, o.ascending !== false]); return this; }
  range(a, b) { this.rg = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const tbl = (store.tables[this.t] ??= []);
    const match = (r) => this.f.every((fn) => fn(r));
    const now = new Date().toISOString();
    let out;
    if (this.mode === 'insert') {
      out = [].concat(this.v).map((v) => {
        const base = this.t === 'applications' ? { status: 'saved' } : this.t === 'reminders' ? { completed: false } : {};
        const r = { id: randomUUID(), created_at: now, updated_at: now, ...base, ...v };
        if (this.t === 'reminders') r.effective_due_at = r.snoozed_until ?? r.due_at;
        tbl.push(r);
        if (this.t === 'applications') seed('application_events', { application_id: r.id, user_id: r.user_id, event_type: 'created', new_status: r.status });
        return r;
      });
    } else if (this.mode === 'update') {
      out = tbl.filter(match); out.forEach((r) => { Object.assign(r, this.v, { updated_at: now }); if (this.t === 'reminders') r.effective_due_at = r.snoozed_until ?? r.due_at; });
    } else if (this.mode === 'delete') { out = tbl.filter(match); store.tables[this.t] = tbl.filter((r) => !match(r)); }
    else out = tbl.filter(match);
    for (const [k, asc] of [...this.orders].reverse()) out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1));
    const count = out.length;
    if (this.rg) out = out.slice(this.rg[0], this.rg[1] + 1);
    if (this.lim) out = out.slice(0, this.lim);
    if (this.opt?.head) return { data: null, error: null, count };
    if (this.mode === 'delete' || (this.mode !== 'select' && !this.returning)) return { data: null, error: null, count };
    if (this.one) {
      if (out.length === 1) return { data: out[0], error: null };
      if (!out.length) return this.one === 'maybe' ? { data: null, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
    }
    return { data: out, error: null, count };
  }
}

const rpcs = {
  change_application_status(uid, { p_id, p_status, p_note }) {
    const a = rows('applications').find((r) => r.id === p_id && r.user_id === uid);
    if (!a) return { data: null, error: { code: 'P0002', message: 'APPLICATION_NOT_FOUND' } };
    const old = a.status; a.status = p_status;
    if (old !== p_status) seed('application_events', { application_id: a.id, user_id: uid, event_type: 'status_changed', old_status: old, new_status: p_status, description: p_note ?? `Moved from ${old} to ${p_status}` });
    return { data: a, error: null };
  },
  analytics_overview(uid) {
    const mine = rows('applications').filter((a) => a.user_id === uid), sub = mine.filter((a) => a.status !== 'saved');
    return { data: { totalApplications: mine.length, submitted: sub.length, activeApplications: mine.filter((a) => ['applied', 'screening', 'interview'].includes(a.status)).length,
      responded: sub.filter((a) => a.status !== 'applied').length, interviews: sub.filter((a) => ['interview', 'offer'].includes(a.status)).length,
      offers: sub.filter((a) => a.status === 'offer').length, rejections: mine.filter((a) => a.status === 'rejected').length }, error: null };
  },
};
export const makeDb = (uid) => ({ from: (t) => new Q(t, uid), rpc: async (fn, args) => rpcs[fn]?.(uid, args) ?? { data: null, error: { message: 'unknown rpc' } } });

export const supabaseMock = {
  supabaseAdmin: {
    auth: { getUser: async (token) => (USERS[token] ? { data: { user: USERS[token] }, error: null } : { data: { user: null }, error: { message: 'invalid' } }), admin: {} },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), list: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/x' }, error: null }) }) },
  },
  supabaseAnon: { auth: {} },
  createUserClient: (token) => makeDb(USERS[token]?.id),
};
