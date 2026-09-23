import { MusicError } from '../api/errors.js';

export function normalizeQuery(input: string): string {
  if (typeof input !== 'string' || input.length > 500) {
    throw new MusicError('INVALID_QUERY', 'Enter a shorter song query.');
  }
  const normalized = input.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!normalized) throw new MusicError('INVALID_QUERY', 'Enter a song query.');
  return normalized;
}
