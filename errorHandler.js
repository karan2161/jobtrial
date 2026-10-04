import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler = (req, res) =>
  res.status(404).json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' } });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let e = err;
  if (err instanceof multer.MulterError) {
    e = err.code === 'LIMIT_FILE_SIZE'
      ? new AppError(413, 'FILE_TOO_LARGE', `File exceeds the ${env.MAX_RESUME_MB} MB limit.`)
      : new AppError(400, 'UPLOAD_ERROR', 'Invalid upload.');
  } else if (err?.type === 'entity.parse.failed') e = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  else if (err?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');

  if (e instanceof AppError) {
    return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message, ...(e.details && { details: e.details }) } });
  }
  console.error('UNHANDLED ERROR:', {
  path: req.path,
  method: req.method,
  name: err?.name,
  message: err?.message,
  code: err?.code,
  details: err?.details,
  hint: err?.hint,
  status: err?.status,
});

res.status(500).json({
  success: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side.'
  }
});
};
