import { resumeService } from '../services/resumeService.js';
import { reqText } from '../utils/validation.js';
import { asyncHandler, ok } from '../utils/response.js';
export const resumeController = {
  list: asyncHandler(async (req, res) => ok(res, await resumeService.list(req.db, req.user.id))),
  get: asyncHandler(async (req, res) => ok(res, await resumeService.get(req.db, req.user.id, req.params.id, req.query.include === 'text'))),
  create: asyncHandler(async (req, res) => {
    const name = req.body?.name ? reqText(120).parse(req.body.name) : undefined;
    ok(res, await resumeService.create(req.db, req.user.id, req.file, name), 201);
  }),
  update: asyncHandler(async (req, res) => ok(res, await resumeService.rename(req.db, req.user.id, req.params.id, req.body.name))),
  remove: asyncHandler(async (req, res) => { await resumeService.remove(req.db, req.user.id, req.params.id); ok(res, { deleted: true }); }),
  download: asyncHandler(async (req, res) => ok(res, await resumeService.downloadUrl(req.db, req.user.id, req.params.id))),
};
