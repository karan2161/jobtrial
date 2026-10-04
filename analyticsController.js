import { activityService } from '../services/activityService.js';
import { analyticsService } from '../services/analyticsService.js';
import { asyncHandler, ok } from '../utils/response.js';
export const analyticsController = {
  overview: asyncHandler(async (req, res) => ok(res, await analyticsService.overview(req.db, req.query.range))),
  dashboard: asyncHandler(async (req, res) => ok(res, await analyticsService.dashboard(req.db, req.user.id, req.query.range))),
  activity: asyncHandler(async (req, res) => ok(res, await activityService.recent(req.db, req.user.id, req.query.limit))),
};
