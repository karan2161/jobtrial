import { jdService as s } from '../services/jobDescriptionService.js';
import { asyncHandler, ok } from '../utils/response.js';
export const jobDescriptionController = {
  list: asyncHandler(async (req, res) => ok(res, await s.list(req.db, req.user.id))),
  get: asyncHandler(async (req, res) => ok(res, await s.get(req.db, req.user.id, req.params.id))),
  create: asyncHandler(async (req, res) => ok(res, await s.create(req.db, req.user.id, req.body), 201)),
  update: asyncHandler(async (req, res) => ok(res, await s.update(req.db, req.user.id, req.params.id, req.body))),
  remove: asyncHandler(async (req, res) => { await s.remove(req.db, req.user.id, req.params.id); ok(res, { deleted: true }); }),
  analyze: asyncHandler(async (req, res) => ok(res, await s.analyze(req.db, req.user.id, req.body))),
};
