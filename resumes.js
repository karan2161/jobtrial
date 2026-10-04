import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { resumeController as c } from '../controllers/resumeController.js';
import { validate } from '../middleware/validation.js';
import { idParams, resumeUpdate } from '../utils/validation.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_RESUME_MB * 1024 * 1024, files: 1 } });
const router = Router();
router.get('/', c.list);
router.post('/', upload.single('file'), c.create); // multipart: file (+ optional name)
router.get('/:id', validate({ params: idParams }), c.get);
router.get('/:id/download', validate({ params: idParams }), c.download);
router.put('/:id', validate({ params: idParams, body: resumeUpdate }), c.update);
router.delete('/:id', validate({ params: idParams }), c.remove);
export default router;
