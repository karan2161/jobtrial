import { resumeVersionService as s } from '../services/resumeVersionService.js';
import { resumeExportService as e } from '../services/resumeExportService.js';
import { asyncHandler, ok } from '../utils/response.js';
export const resumeVersionController = {
  list: asyncHandler(async (req, res) => ok(res, await s.list(req.db, req.user.id, req.query.resume_id))),
  get: asyncHandler(async (req, res) => ok(res, await s.get(req.db, req.user.id, req.params.id))),
  create: asyncHandler(async (req, res) => ok(res, await s.create(req.db, req.user.id, req.body), 201)),
  update: asyncHandler(async (req, res) => ok(res, await s.update(req.db, req.user.id, req.params.id, req.body))),
  duplicate: asyncHandler(async (req, res) => ok(res, await s.duplicate(req.db, req.user.id, req.params.id), 201)),
  restore: asyncHandler(async (req, res) => ok(res, await s.restore(req.db, req.user.id, req.params.id), 201)),
  compare: asyncHandler(async (req, res) => ok(res, await s.compare(req.db, req.user.id, req.params.id, req.query.against))),
  remove: asyncHandler(async (req, res) => { await s.remove(req.db, req.user.id, req.params.id); ok(res, { deleted: true }); }),
  download: asyncHandler(async (req, res) => {
    const file = await e.export(req.db, req.user.id, req.params.id, req.query.format || 'docx');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', file.buffer.length);
    res.send(file.buffer);
  }),
};
