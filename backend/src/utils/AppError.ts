import type { ErrorCode } from '@order-desk/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
  static badRequest(message: string, details?: unknown) { return new AppError(400, 'VALIDATION_ERROR', message, details); }
  static badId() { return new AppError(400, 'BAD_ID', 'Invalid id'); }
  static unauthorized(message = 'Authentication required') { return new AppError(401, 'UNAUTHORIZED', message); }
  static notFound(what = 'Resource') { return new AppError(404, 'NOT_FOUND', `${what} not found`); }
  static conflict(code: ErrorCode, message: string, details?: unknown) { return new AppError(409, code, message, details); }
}
