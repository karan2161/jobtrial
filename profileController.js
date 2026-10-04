import { profileService } from '../services/profileService.js';
import { asyncHandler, ok } from '../utils/response.js';
export const profileController = {
  get: asyncHandler(async (req, res) => ok(res, await profileService.get(req.db, req.user.id))),
  update: asyncHandler(async (req, res) => ok(res, await profileService.update(req.db, req.user.id, req.body))),
};
