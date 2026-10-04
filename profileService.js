import { unwrap } from '../utils/errors.js';
import { stripUndefined } from '../utils/validation.js';

export const profileService = {
  async get(db, userId) {
    let p = unwrap(await db.from('profiles').select().eq('id', userId).maybeSingle());
    if (!p) p = unwrap(await db.from('profiles').insert({ id: userId }).select().single()); // self-heal if the signup trigger was missed
    return p;
  },
  async update(db, userId, body) {
    await this.get(db, userId);
    return unwrap(await db.from('profiles').update(stripUndefined(body)).eq('id', userId).select().single());
  },
};
