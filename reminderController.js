import { reminderService as s } from '../services/reminderService.js';
import { asyncHandler, ok, list } from '../utils/response.js';
export const reminderController = {
  list: asyncHandler(async (req, res) => { const r = await s.list(req.db, req.user.id, req.query); list(res, r.data, r.pagination); }),
  create: asyncHandler(async (req, res) => ok(res, await s.create(req.db, req.user.id, req.body), 201)),
  update: asyncHandler(async (req, res) => ok(res, await s.update(req.db, req.user.id, req.params.id, req.body))),
  complete: asyncHandler(async (req, res) => ok(res, await s.complete(req.db, req.user.id, req.params.id))),
  snooze: asyncHandler(async (req, res) => ok(res, await s.snooze(req.db, req.user.id, req.params.id, req.body))),
  remove: asyncHandler(async (req, res) => { await s.remove(req.db, req.user.id, req.params.id); ok(res, { deleted: true }); }),
};
