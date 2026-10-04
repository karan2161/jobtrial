import { Router } from 'express';
import { analyticsController as c } from '../controllers/analyticsController.js';
import { validate } from '../middleware/validation.js';
import { analyticsQuery } from '../utils/validation.js';
const router = Router();
router.get('/overview', validate({ query: analyticsQuery }), c.overview);
router.get('/dashboard', validate({ query: analyticsQuery }), c.dashboard);
export default router;
