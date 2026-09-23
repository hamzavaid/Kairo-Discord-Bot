import pino from 'pino';

export function createLogger(level: string = 'info') {
  return pino({
    level,
    redact: {
      paths: [
        'DISCORD_TOKEN',
        'MONGODB_URI',
        'token',
        'authorization',
        'headers.authorization',
      ],
      censor: '[redacted]',
    },
  });
}
