import { Router } from 'express';
import { aiController as c } from '../controllers/aiController.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validation.js';
import { analyzeResumeBody, analysesQuery, bulletBody, chatBody, idParams, tailorBody } from '../utils/validation.js';
const router = Router();
// Stricter per-user limit on everything that can spend AI tokens
router.post('/analyze-resume', aiLimiter, validate({ body: analyzeResumeBody }), c.analyzeResume);
router.post('/tailor-resume', aiLimiter, validate({ body: tailorBody }), c.tailorResume);
router.post('/improve-bullet', aiLimiter, validate({ body: bulletBody }), c.improveBullet);
router.post('/chat', aiLimiter, validate({ body: chatBody }), c.chat);
router.get('/analyses', validate({ query: analysesQuery }), c.listAnalyses);
router.get('/analyses/:id', validate({ params: idParams }), c.getAnalysis);
router.get('/conversations', c.conversations);
router.get('/conversations/:id/messages', validate({ params: idParams }), c.messages);
router.delete('/conversations/:id', validate({ params: idParams }), c.removeConversation);
export default router;
