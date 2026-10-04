import { authService } from '../services/authService.js';
import { badRequest } from '../utils/errors.js';
import { asyncHandler, ok } from '../utils/response.js';

export const authController = {
  signup: asyncHandler(async (req, res) => ok(res, await authService.signup(req.body), 201)),
  login: asyncHandler(async (req, res) => ok(res, await authService.login(req.body))),
  refresh: asyncHandler(async (req, res) => ok(res, await authService.refresh(req.body.refresh_token))),
  forgot: asyncHandler(async (req, res) => { await authService.forgotPassword(req.body.email); ok(res, { message: 'If that email is registered, a reset link is on its way.' }); }),
  reset: asyncHandler(async (req, res) => { await authService.resetPassword(req.user.id, req.body.password); ok(res, { message: 'Password updated.' }); }),
  logout: asyncHandler(async (req, res) => { await authService.logout(req.token); ok(res, { message: 'Logged out.' }); }),
  me: asyncHandler(async (req, res) => ok(res, req.user)),
  exportData: asyncHandler(async (req, res) => ok(res, await authService.exportData(req.db, req.user.id))),
  deleteAccount: asyncHandler(async (req, res) => {
    if (req.body?.confirm !== 'DELETE') throw badRequest('CONFIRMATION_REQUIRED', 'Send {"confirm": "DELETE"} to delete your account.');
    await authService.deleteAccount(req.user.id);
    ok(res, { message: 'Account deleted.' });
  }),
};
