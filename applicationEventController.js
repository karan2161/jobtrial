import { applicationService } from '../services/applicationService.js';
import { asyncHandler, ok } from '../utils/response.js';
export const applicationEventController = {
  create: asyncHandler(async (req, res) => ok(res, await applicationService.addEvent(req.db, req.user.id, req.params.id, req.body), 201)),
};
