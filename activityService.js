import { logger } from '../utils/logger.js';
import { unwrap } from '../utils/errors.js';

export const activityService = {
  /** Best-effort audit entry; a logging failure never breaks the user's action. */
  async log(db, userId, type, entityType, entityId, metadata = {}) {
    const { error } = await db.from('activity_logs').insert({ user_id: userId, activity_type: type, entity_type: entityType, entity_id: entityId, metadata });
    if (error) logger.warn('activity_log_failed', { type, code: error.code });
  },
  async recent(db, userId, limit) {
    return unwrap(await db.from('activity_logs').select('id, activity_type, entity_type, entity_id, metadata, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit));
  },
};
