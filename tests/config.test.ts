import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '@kairo/shared';

const valid = {
  DISCORD_TOKEN: 'test-token',
  DISCORD_CLIENT_ID: '123456789012345678',
  MONGODB_URI: 'mongodb://localhost:27017/kairo',
};

describe('environment validation', () => {
  it('applies documented defaults', () => {
    expect(parseEnvironment(valid)).toMatchObject({
      LOG_LEVEL: 'info',
      MUSIC_MAX_QUEUE_LENGTH: 500,
      MUSIC_DEFAULT_VOLUME: 0.75,
    });
  });

  it('rejects missing credentials and invalid numeric limits', () => {
    expect(() => parseEnvironment({ ...valid, DISCORD_TOKEN: '' })).toThrow();
    expect(() =>
      parseEnvironment({ ...valid, MUSIC_MAX_QUEUE_LENGTH: '0' }),
    ).toThrow();
  });
});
