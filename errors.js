export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}
export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have access to this resource.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (code, message) => new AppError(404, code, message);
export const conflict = (code, message) => new AppError(409, code, message);

/** Convert a Supabase/Postgres error into a safe AppError (no SQL details leak to clients). */
export function fromDb(error) {
  if (!error) return null;
  if (error instanceof AppError) return error;
  if (error.code === 'P0002' || error.message === 'APPLICATION_NOT_FOUND') return notFound('APPLICATION_NOT_FOUND', 'Application not found.');
  if (error.code === '42501') return forbidden('Referenced record does not belong to you.');
  if (error.code === '23503') return badRequest('INVALID_REFERENCE', 'A referenced record does not exist.');
  if (error.code === '23505') return conflict('DUPLICATE', 'This record already exists.');
  if (error.code === '22P02' || error.code === '23514') return badRequest('INVALID_DATA', 'Some values are invalid.');
  return new AppError(500, 'DATABASE_ERROR', 'Something went wrong while accessing your data.');
}

/** Unwrap a Supabase response: throws a safe AppError, returns data. */
export function unwrap({ data, error }) {
  if (error) throw fromDb(error);
  return data;
}
