import { applicationService as s } from '../services/applicationService.js';
import { asyncHandler, ok, list } from '../utils/response.js';
export const applicationController = {
  list: asyncHandler(async (req, res) => { const r = await s.list(req.db, req.user.id, req.query); list(res, r.data, r.pagination); }),
  get: asyncHandler(async (req, res) => ok(res, await s.get(req.db, req.user.id, req.params.id))),
  create: asyncHandler(async (req, res) => ok(res, await s.create(req.db, req.user.id, req.body), 201)),
  update: asyncHandler(async (req, res) => ok(res, await s.update(req.db, req.user.id, req.params.id, req.body))),
  status: asyncHandler(async (req, res) => ok(res, await s.changeStatus(req.db, req.user.id, req.params.id, req.body.status, req.body.note))),
  remove: asyncHandler(async (req, res) => { await s.remove(req.db, req.user.id, req.params.id); ok(res, { deleted: true }); }),
};
