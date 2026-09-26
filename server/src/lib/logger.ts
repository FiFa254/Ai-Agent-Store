import pino from 'pino';

export type Logger = pino.Logger;

export const createLogger = (level: string) =>
  pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.cookie', 'password', 'newPassword', 'currentPassword'],
  });
