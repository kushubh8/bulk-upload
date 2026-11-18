import pino from 'pino';
import { config } from '../config';

const transport =
  config.nodeEnv !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

export const logger = pino(
  {
    level: config.logLevel,
    base: {
      service: 'bulk-upload',
      env: config.nodeEnv,
    },
  },
  transport ? pino.transport(transport) : undefined,
);

export function createChildLogger(
  context: Record<string, string | number>,
): pino.Logger {
  return logger.child(context);
}
