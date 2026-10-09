import type { PlayOutcome } from '../../services/MusicService.js';
import { display } from '../library/helpers.js';

export function playResponse(result: PlayOutcome, next = false): string {
  if (!result.collection)
    return `${result.position === 0 ? 'Playing' : next ? 'Queued next' : `Queued #${result.position}`}: ${display(result.track.title, 150)}`;
  const collection = result.collection;
  const summary = collection.importSummary;
  const details = [
    summary?.skipped ? `${summary.skipped} skipped` : '',
    summary?.failed ? `${summary.failed} failed` : '',
    summary?.truncated ? 'collection limit reached' : '',
    summary?.partial ? 'partial collection' : '',
  ].filter(Boolean);
  const placement =
    result.position === 0
      ? 'Starting playback'
      : `Starting at queue #${result.position}`;
  return `Queued ${collection.queued} songs from ${display(collection.title, 100)}. ${placement}.${details.length ? ` ${details.join('; ')}.` : ''}`;
}
