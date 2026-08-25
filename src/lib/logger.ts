import { env } from '@/lib/config';
import { redact } from '@/lib/crypto/credentials';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogContext {
  correlationId?: string;
  organisationId?: string;
  connectionId?: string;
  [key: string]: unknown;
}

/**
 * Structured logger. Every payload passes through `redact` first, so a stray
 * access token in a context object can never reach the log stream.
 */
function write(level: Level, message: string, context?: LogContext): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[env().LOG_LEVEL]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
  child(base: LogContext) {
    return {
      debug: (message: string, context?: LogContext) => write('debug', message, { ...base, ...context }),
      info: (message: string, context?: LogContext) => write('info', message, { ...base, ...context }),
      warn: (message: string, context?: LogContext) => write('warn', message, { ...base, ...context }),
      error: (message: string, context?: LogContext) => write('error', message, { ...base, ...context }),
    };
  },
};

export function newCorrelationId(prefix = 'ccc'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}
