import { analysisService as a, chatService as c } from '../services/analysisService.js';
import { asyncHandler, ok } from '../utils/response.js';
const U = (req) => [req.db, req.user.id];
export const aiController = {
  analyzeResume: asyncHandler(async (req, res) => ok(res, await a.analyzeResume(...U(req), req.body))),
  tailorResume: asyncHandler(async (req, res) => ok(res, await a.tailorResume(...U(req), req.body), 201)),
  improveBullet: asyncHandler(async (req, res) => ok(res, await a.improveBullet(...U(req), req.body))),
  listAnalyses: asyncHandler(async (req, res) => ok(res, await a.listAnalyses(...U(req), req.query))),
  getAnalysis: asyncHandler(async (req, res) => ok(res, await a.getAnalysis(...U(req), req.params.id))),
  chat: asyncHandler(async (req, res) => ok(res, await c.chat(...U(req), req.body))),
  conversations: asyncHandler(async (req, res) => ok(res, await c.listConversations(...U(req)))),
  messages: asyncHandler(async (req, res) => ok(res, await c.messages(...U(req), req.params.id))),
  removeConversation: asyncHandler(async (req, res) => { await c.removeConversation(...U(req), req.params.id); ok(res, { deleted: true }); }),
};
