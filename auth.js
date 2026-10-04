import { Router } from 'express';
import { authController as c } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validation.js';
import { forgotBody, loginBody, refreshBody, resetBody, signupBody } from '../utils/validation.js';

const router = Router();
router.post('/signup', authLimiter, validate({ body: signupBody }), c.signup);
router.post('/login', authLimiter, validate({ body: loginBody }), c.login);
router.post('/refresh', authLimiter, validate({ body: refreshBody }), c.refresh);
router.post('/forgot-password', authLimiter, validate({ body: forgotBody }), c.forgot);
router.post('/reset-password', authenticate, validate({ body: resetBody }), c.reset); // Bearer = recovery-link access token
router.post('/logout', authenticate, c.logout);
router.get('/me', authenticate, c.me);
router.get('/export', authenticate, c.exportData);
router.delete('/account', authenticate, c.deleteAccount);
export default router;
