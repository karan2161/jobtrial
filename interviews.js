import { Router } from 'express';
import { interviewController as c } from '../controllers/interviewController.js';
import { validate } from '../middleware/validation.js';
import { idParams, interviewUpdate } from '../utils/validation.js';
const router = Router();
router.put('/:id', validate({ params: idParams, body: interviewUpdate }), c.update);
router.delete('/:id', validate({ params: idParams }), c.remove);
export default router;
