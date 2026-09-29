import type { EngineOptions } from '@kairo/music-engine';
import type { Environment } from '@kairo/shared';

function musicBrainzContact(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const configured = value.trim();
  return (
    /https?:\/\/[^\s)]+/u.exec(configured)?.[0] ??
    /[^\s(@]+@[^\s)@]+\.[^\s)@]+/u.exec(configured)?.[0] ??
    configured
  );
}

export function developerIdsFromEnvironment(
  environment: Environment,
): ReadonlySet<string> {
  return new Set(
    environment.KAIRO_DEVELOPER_IDS.split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d{17,20}$/u.test(id)),
  );
}

export function addApplicationOwner(
  developerIds: Set<string>,
  owner: { id: string } | { ownerId: string } | null,
): void {
  if (!owner) return;
  developerIds.add('ownerId' in owner ? owner.ownerId : owner.id);
}

export function createBotMusicOptions(environment: Environment): EngineOptions {
  const fixturePath = environment.KAIRO_FIXTURE_AUDIO_PATH?.trim();
  const contact = musicBrainzContact(environment.MUSICBRAINZ_USER_AGENT);
  return {
    ...(environment.KAIRO_METADATA_PROVIDER
      ? { metadataProvider: environment.KAIRO_METADATA_PROVIDER }
      : {}),
    ...(environment.YOUTUBE_API_KEY?.trim()
      ? { youtubeApi: { apiKey: environment.YOUTUBE_API_KEY.trim() } }
      : {}),
    ...(environment.SPOTIFY_CLIENT_ID?.trim() &&
    environment.SPOTIFY_CLIENT_SECRET?.trim()
      ? {
          spotify: {
            clientId: environment.SPOTIFY_CLIENT_ID.trim(),
            clientSecret: environment.SPOTIFY_CLIENT_SECRET.trim(),
          },
        }
      : {}),
    ...(contact ? { musicBrainz: { contact } } : {}),
    ...(fixturePath
      ? {
          fixtureTracks: [
            { id: 'demo', title: 'Kairo demo', artists: [{ name: 'Kairo' }] },
          ],
          fixtureAudio: {
            demo: {
              path: fixturePath,
              ...(environment.KAIRO_FIXTURE_AUDIO_INPUT_TYPE
                ? { inputType: environment.KAIRO_FIXTURE_AUDIO_INPUT_TYPE }
                : {}),
            },
          },
        }
      : {}),
    maxQueueEntries: environment.MUSIC_MAX_QUEUE_LENGTH,
    ffmpegPath: environment.FFMPEG_PATH,
  };
}
