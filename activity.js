import { Router } from 'express';
import { analyticsController as c } from '../controllers/analyticsController.js';
import { validate } from '../middleware/validation.js';
import { activityQuery } from '../utils/validation.js';
const router = Router();
router.get('/', validate({ query: activityQuery }), c.activity);
export default router;
