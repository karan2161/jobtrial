export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const list = (res, data, pagination) => res.json({ success: true, data, pagination });
export const paginate = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
