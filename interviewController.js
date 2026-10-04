import { interviewService as s } from '../services/interviewService.js';
import { asyncHandler, ok } from '../utils/response.js';
export const interviewController = {
  listForApplication: asyncHandler(async (req, res) => ok(res, await s.listForApplication(req.db, req.user.id, req.params.id))),
  create: asyncHandler(async (req, res) => ok(res, await s.create(req.db, req.user.id, req.params.id, req.body), 201)),
  update: asyncHandler(async (req, res) => ok(res, await s.update(req.db, req.user.id, req.params.id, req.body))),
  remove: asyncHandler(async (req, res) => { await s.remove(req.db, req.user.id, req.params.id); ok(res, { deleted: true }); }),
};
