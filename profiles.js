import { Router } from 'express';
import { profileController as c } from '../controllers/profileController.js';
import { validate } from '../middleware/validation.js';
import { profileUpdate } from '../utils/validation.js';
const router = Router();
router.get('/me', c.get);
router.put('/me', validate({ body: profileUpdate }), c.update);
export default router;
