/**
 * Application error taxonomy.
 *
 * Every error carries a stable `code` for the UI, an operator-safe `message`
 * that is guaranteed free of secrets, and an optional `detail` that is only
 * ever logged server-side.
 */
import { redactString } from '@/lib/crypto/credentials';

export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'TENANT_MISMATCH'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CONFIRMATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'DEMO_MODE_BLOCKED'
  | 'OUTBOUND_DISABLED'
  | 'CREDENTIAL_MISSING'
  | 'CREDENTIAL_INVALID'
  | 'UPSTREAM_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly detail?: string;
  readonly hint?: string;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { status?: number; detail?: string; hint?: string; cause?: unknown } = {},
  ) {
    super(redactString(message), { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.detail = options.detail ? redactString(options.detail) : undefined;
    this.hint = options.hint;
  }

  /** Shape returned to the browser. Never includes `detail`. */
  toPublicJSON() {
    return { error: { code: this.code, message: this.message, hint: this.hint } };
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
    case 'TENANT_MISMATCH':
    case 'DEMO_MODE_BLOCKED':
    case 'OUTBOUND_DISABLED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'VALIDATION_FAILED':
    case 'CONFIRMATION_REQUIRED':
      return 422;
    case 'CONFLICT':
    case 'APPROVAL_REQUIRED':
      return 409;
    case 'CAPABILITY_UNAVAILABLE':
    case 'CREDENTIAL_MISSING':
    case 'CREDENTIAL_INVALID':
      return 424;
    case 'RATE_LIMITED':
      return 429;
    case 'TIMEOUT':
      return 504;
    case 'NOT_IMPLEMENTED':
      return 501;
    case 'UPSTREAM_ERROR':
      return 502;
    default:
      return 500;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Converts anything thrown into a safe AppError. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError('INTERNAL', 'An unexpected error occurred.', {
      detail: `${error.name}: ${error.message}`,
      cause: error,
    });
  }
  return new AppError('INTERNAL', 'An unexpected error occurred.', { detail: String(error) });
}
