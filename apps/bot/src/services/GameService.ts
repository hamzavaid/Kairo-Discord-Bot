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
import {
  WorkScope,
  OperationError,
  currentOperationSignal,
  WriteQueue,
} from '@kairo/shared';
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
  voiceChannelId?: string;
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
  private readonly preparation = new WorkScope(20_000, 16);
  private closeWork?: Promise<void>;
  private readonly statistics: WriteQueue;
  private readonly finishing = new Set<Promise<void>>();
  constructor(
    readonly repository: GameRepository,
    private readonly music: MusicService,
    private readonly library: LibraryService,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
    report: (error: unknown) => void = () => {},
  ) {
    this.statistics = new WriteQueue(512, 2000, report);
  }
  async create(input: GameSetup): Promise<GameSession> {
    try {
      return await this.preparation.run(() => this.prepare(input));
    } catch (error) {
      if (error instanceof OperationError)
        throw new GameError(
          error.code === 'RESOURCE_BUSY' ? 'GAME_INVALID' : 'GAME_FINISHED',
          error.message,
        );
      throw error;
    }
  }
  private async prepare(input: GameSetup): Promise<GameSession> {
    requireGame(!this.closing, 'GAME_FINISHED', 'Games are shutting down.');
    const settings = await this.repository.settings(input.guildId);
    requireGame(
      settings.enabledGames.includes(input.kind),
      'GAME_FORBIDDEN',
      'This game is disabled in this server.',
    );
    requireGame(
      input.kind !== 'musictrivia' ||
        input.rounds === undefined ||
        input.rounds <= settings.maxRounds,
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
    requireGame(!this.closing, 'GAME_FINISHED', 'Games are shutting down.');
    currentOperationSignal()?.throwIfAborted();
    const game = this.manager.create({
      guildId: input.guildId,
      channelId: input.channelId,
      hostId: input.hostId,
      kind: input.kind,
      ...(input.invitedUserId ? { invitedUserId: input.invitedUserId } : {}),
      ...(input.bestOf !== undefined ? { bestOf: input.bestOf } : {}),
      ...(input.answerMode ? { answerMode: input.answerMode } : {}),
      ...(input.stackDrawTwo !== undefined
        ? { stackDrawTwo: input.stackDrawTwo }
        : {}),
      ...(input.drawUntilPlayable !== undefined
        ? { drawUntilPlayable: input.drawUntilPlayable }
        : {}),
      id: randomUUID(),
      now: this.now(),
      rounds:
        input.kind === 'musictrivia'
          ? Math.min(
              input.rounds ?? Math.min(5, settings.maxRounds),
              tracks.length,
            )
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
      runtime.voiceChannelId = target.channelId;
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
    voiceChannelId?: string,
  ) {
    const runtime = this.runtime(game);
    requireGame(
      game.options.kind !== 'musictrivia' ||
        (!!voiceChannelId && voiceChannelId === runtime.voiceChannelId),
      'GAME_FORBIDDEN',
      'Join the trivia voice channel before submitting a guess.',
    );
    try {
      game.act(userId, action, revision, this.now());
    } finally {
      await this.sync(game);
    }
  }
  async tick(game: GameSession) {
    if (!this.active.has(game.options.id)) return;
    if (
      game.options.kind === 'musictrivia' &&
      this.runtime(game).leaseId &&
      typeof this.music.playback === 'function' &&
      !this.music.playback(game.options.guildId).previewActive
    )
      game.stop(game.options.hostId);
    game.tick(this.now());
    await this.sync(game);
  }
  async decline(game: GameSession, userId: string) {
    game.decline(userId);
    await this.sync(game);
  }
  async stop(game: GameSession, userId: string) {
    game.stop(userId);
    if (this.active.has(game.options.id)) await this.sync(game);
  }
  private async finish(runtime: Runtime) {
    if (runtime.finalized) return;
    runtime.finalized = true;
    const game = runtime.game;
    const work = (async () => {
      try {
        if (runtime.leaseId) {
          await this.music.releasePreview(
            game.options.guildId,
            runtime.leaseId,
          );
          delete runtime.leaseId;
        }
        for (const result of game.results())
          this.statistics.add(() => this.repository.record(result));
        await this.statistics.drain();
        this.active.delete(game.options.id);
        this.manager.release(game);
      } catch (error) {
        runtime.finalized = false;
        throw error;
      }
    })();
    this.finishing.add(work);
    try {
      await work;
    } finally {
      this.finishing.delete(work);
    }
  }
  private async sync(game: GameSession) {
    const runtime = this.runtime(game);
    const phase = game.view().phase;
    if (phase === 'reveal' && runtime.leaseId)
      await this.music.stopPreview(game.options.guildId, runtime.leaseId);
    if (phase === 'finished' || phase === 'abandoned') {
      await this.finish(runtime);
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
    this.closeWork ??= this.cleanup();
    return this.closeWork;
  }
  private async cleanup() {
    this.closing = true;
    this.preparation.close();
    for (const fn of this.closers) fn();
    this.closers.clear();
    const active = [...this.active.values()];
    const cleanup = await Promise.allSettled(
      active.map(async (r) => {
        r.game.stop(r.game.options.hostId);
        try {
          if (r.leaseId)
            await this.music.releasePreview(r.game.options.guildId, r.leaseId);
          await r.job;
        } finally {
          this.manager.release(r.game);
        }
      }),
    );
    const persisted = await Promise.allSettled([...this.finishing]);
    await this.statistics.close();
    this.active.clear();
    const failed = [...cleanup, ...persisted].find(
      (r) => r.status === 'rejected',
    );
    if (failed?.status === 'rejected') throw failed.reason;
  }
}
export { GameError };
