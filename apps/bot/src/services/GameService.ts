import { randomUUID } from 'node:crypto';
import {
  GameManager,
  GameError,
  requireGame,
  type GameSession,
  type GameAction,
  type GameKind,
} from '@kairo/games';
import {
  trackIdentity,
  type GameRepository,
  type GameSettings,
} from '@kairo/data';
import type { Track, VoiceTarget } from '@kairo/music-engine';
import { restoreTrack, type LibraryService } from './LibraryService.js';
import type { MusicService } from './MusicService.js';
export interface GameSetup {
  guildId: string;
  channelId: string;
  hostId: string;
  kind: GameKind;
  invitedUserId?: string;
  bestOf?: number;
  rounds?: number;
  answerMode?: 'song' | 'artist' | 'both';
  source?: 'catalog' | 'liked' | 'playlist' | 'public';
  query?: string;
  playlist?: string;
  url?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  stackDrawTwo?: boolean;
  drawUntilPlayable?: boolean;
}
interface Runtime {
  game: GameSession;
  tracks: Track[];
  settings: GameSettings;
  leaseId?: string;
  job?: Promise<void>;
  finalized?: boolean;
}
const words = [
  'rhythm',
  'melody',
  'orchestra',
  'guitar',
  'festival',
  'harmony',
  'keyboard',
  'microphone',
  'headphones',
  'symphony',
];
export class GameService {
  private readonly closers = new Set<() => void>();
  onClose(callback: () => void) {
    this.closers.add(callback);
    return () => this.closers.delete(callback);
  }
  readonly manager = new GameManager();
  private readonly active = new Map<string, Runtime>();
  private closing = false;
  constructor(
    readonly repository: GameRepository,
    private readonly music: MusicService,
    private readonly library: LibraryService,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}
  async create(input: GameSetup): Promise<GameSession> {
    requireGame(!this.closing, 'GAME_FINISHED', 'Games are shutting down.');
    const settings = await this.repository.settings(input.guildId);
    requireGame(
      settings.enabledGames.includes(input.kind),
      'GAME_FORBIDDEN',
      'This game is disabled in this server.',
    );
    requireGame(
      (input.rounds ?? 5) <= settings.maxRounds,
      'GAME_INVALID',
      `Choose up to ${settings.maxRounds} rounds.`,
    );
    let tracks: Track[] = [];
    if (input.kind === 'musictrivia') {
      const source = input.source ?? 'catalog';
      if (source === 'liked' || source === 'playlist') {
        requireGame(
          source === 'liked' || !!input.playlist,
          'GAME_INVALID',
          'Enter your Kairo playlist name.',
        );
        const collection =
          source === 'liked'
            ? await this.library.liked(input.hostId)
            : await this.library.get(input.hostId, input.playlist!);
        tracks = collection.entries.map((e) =>
          restoreTrack(e.track, input.hostId),
        );
      } else if (source === 'public') {
        requireGame(
          !!input.url,
          'GAME_INVALID',
          'Enter a supported public collection URL.',
        );
        const collection = await this.music.collection(
          input.url,
          input.guildId,
          input.hostId,
        );
        requireGame(
          collection.visibility === 'public' ||
            (['youtube-api', 'youtube-sr'].includes(
              collection.sourceProvider,
            ) &&
              collection.visibility !== 'private'),
          'GAME_FORBIDDEN',
          'This collection is private or its public visibility cannot be verified.',
        );
        tracks = collection.tracks;
      } else
        tracks = await this.music.infoResults(
          input.query?.trim() || 'popular music songs',
          input.guildId,
          input.hostId,
          25,
        );
      const distinct = new Map<string, Track>();
      for (const track of tracks)
        if (
          !track.isLive &&
          (track.durationMs === undefined || track.durationMs >= 3000)
        )
          distinct.set(trackIdentity(track), track);
      tracks = [...distinct.values()].slice(0, 200);
      for (let n = tracks.length - 1; n > 0; n--) {
        const j = Math.floor(
          Math.max(0, Math.min(0.999999, this.random())) * (n + 1),
        );
        [tracks[n], tracks[j]] = [tracks[j]!, tracks[n]!];
      }
      requireGame(
        tracks.length,
        'GAME_INVALID',
        'No suitable trivia tracks were found.',
      );
    }
    const answerSeconds =
      input.difficulty === 'hard'
        ? Math.max(10, Math.floor(settings.answerSeconds / 2))
        : input.difficulty === 'easy'
          ? Math.min(60, settings.answerSeconds + 15)
          : settings.answerSeconds;
    const game = this.manager.create({
      ...input,
      id: randomUUID(),
      now: this.now(),
      rounds:
        input.kind === 'musictrivia'
          ? Math.min(input.rounds ?? 5, tracks.length)
          : (input.rounds ?? 5),
      tracks: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artists: t.artists.map((a) => a.name),
      })),
      word: words[Math.floor(this.random() * words.length)]!,
      lobbyMs: settings.lobbySeconds * 1000,
      turnMs: settings.turnSeconds * 1000,
      answerMs: answerSeconds * 1000,
      manualPreview: true,
      random: this.random,
    });
    this.active.set(game.options.id, { game, settings, tracks });
    return game;
  }
  private runtime(game: GameSession) {
    const runtime = this.active.get(game.options.id);
    requireGame(runtime, 'GAME_NOT_FOUND', 'This game has ended.');
    return runtime;
  }
  async start(game: GameSession, userId: string, target?: VoiceTarget) {
    requireGame(
      game.view().hostId === userId && game.view().phase === 'lobby',
      'GAME_FORBIDDEN',
      'Only the host can start this lobby.',
    );
    const runtime = this.runtime(game);
    if (game.options.kind === 'musictrivia') {
      requireGame(
        target && target.guildId === game.options.guildId,
        'GAME_INVALID',
        'Join voice before starting music trivia.',
      );
      runtime.leaseId = (
        await this.music.acquirePreview(target, game.options.id)
      ).leaseId;
    }
    try {
      game.start(userId, this.now());
      await this.sync(game);
    } catch (error) {
      if (runtime.leaseId) {
        await this.music.releasePreview(game.options.guildId, runtime.leaseId);
        delete runtime.leaseId;
      }
      throw error;
    }
  }
  async act(
    game: GameSession,
    userId: string,
    action: GameAction,
    revision: number,
  ) {
    game.act(userId, action, revision, this.now());
    await this.sync(game);
  }
  async tick(game: GameSession) {
    if (!this.active.has(game.options.id)) return;
    game.tick(this.now());
    await this.sync(game);
  }
  async stop(game: GameSession, userId: string) {
    game.stop(userId);
    await this.sync(game);
  }
  private async sync(game: GameSession) {
    const runtime = this.runtime(game);
    const phase = game.view().phase;
    if (phase === 'reveal' && runtime.leaseId)
      await this.music.stopPreview(game.options.guildId, runtime.leaseId);
    if (phase === 'finished' || phase === 'abandoned') {
      if (runtime.finalized) return;
      runtime.finalized = true;
      try {
        if (runtime.leaseId) {
          await this.music.releasePreview(
            game.options.guildId,
            runtime.leaseId,
          );
          delete runtime.leaseId;
        }
        await Promise.all(
          game.results().map((result) => this.repository.record(result)),
        );
        this.active.delete(game.options.id);
        this.manager.release(game);
      } catch (error) {
        runtime.finalized = false;
        throw error;
      }
      return;
    }
    if (phase !== 'preparing' || !runtime.leaseId) return;
    if (!runtime.job)
      runtime.job = (async () => {
        while (
          game.view().phase === 'preparing' &&
          !this.closing &&
          runtime.leaseId
        ) {
          const answer = game.triviaTrack();
          const track = runtime.tracks.find((t) => t.id === answer.id)!;
          try {
            await this.music.playPreview(
              game.options.guildId,
              runtime.leaseId,
              track,
              runtime.settings.previewSeconds * 1000,
            );
            if (game.view().phase === 'preparing')
              game.previewReady(this.now());
            else
              await this.music.stopPreview(
                game.options.guildId,
                runtime.leaseId,
              );
            return;
          } catch {
            if (game.view().phase !== 'preparing' || this.closing) return;
            game.skipUnavailable(this.now());
          }
        }
      })().finally(() => {
        delete runtime.job;
      });
    await runtime.job;
    if (
      ['finished', 'abandoned'].includes(game.view().phase) &&
      this.active.has(game.options.id)
    )
      await this.sync(game);
  }
  async close() {
    this.closing = true;
    for (const fn of this.closers) fn();
    this.closers.clear();
    const active = [...this.active.values()];
    await Promise.all(
      active.map(async (r) => {
        r.game.stop(r.game.options.hostId);
        if (r.leaseId)
          await this.music.releasePreview(r.game.options.guildId, r.leaseId);
        await r.job;
        this.manager.release(r.game);
      }),
    );
    this.active.clear();
  }
}
export { GameError };
