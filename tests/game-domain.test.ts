import { describe, expect, it } from 'vitest';
import {
  GameSession,
  GameManager,
  normalizeAnswer,
} from '../packages/games/src/index.js';
const tracks = [
  { id: 'one', title: 'Around the World', artists: ['Daft Punk'] },
  { id: 'two', title: 'Harder Better', artists: ['Daft Punk'] },
];
describe('shared game domain', () => {
  it('isolates spectators, host controls, stale revisions and bounded lobbies', () => {
    const manager = new GameManager();
    const game = manager.create({
      id: 'x',
      guildId: 'g',
      channelId: 'c',
      hostId: 'a',
      kind: 'rps',
      now: 0,
    });
    game.spectate('s');
    game.join('b');
    expect(() => game.start('b', 1)).toThrow();
    game.start('a', 1);
    expect(() =>
      game.act('s', { type: 'rps', choice: 'rock' }, game.view().revision, 2),
    ).toThrow();
    expect(() =>
      game.act('a', { type: 'rps', choice: 'rock' }, 0, 2),
    ).toThrow();
    expect(() =>
      manager.create({
        id: 'y',
        guildId: 'g',
        channelId: 'c',
        hostId: 'b',
        kind: 'uno',
        now: 0,
      }),
    ).toThrow();
    const abandoned = new GameSession({
      id: 'z',
      guildId: 'g',
      channelId: 'd',
      hostId: 'a',
      kind: 'rps',
      now: 0,
    });
    abandoned.tick(120001);
    expect(abandoned.view().phase).toBe('abandoned');
  });
  it('keeps RPS choices hidden, resolves ties, best-of and duplicate submissions', () => {
    const game = new GameSession({
      id: 'r',
      guildId: 'g',
      channelId: 'c',
      hostId: 'a',
      kind: 'rps',
      bestOf: 3,
      now: 0,
    });
    game.join('b');
    game.start('a', 1);
    const round = game.view().round;
    game.act('a', { type: 'rps', choice: 'rock' }, game.view().revision, 2);
    expect(JSON.stringify(game.view())).not.toContain('rock');
    expect(() =>
      game.act('a', { type: 'rps', choice: 'paper' }, game.view().revision, 2),
    ).toThrow();
    game.act('b', { type: 'rps', choice: 'rock' }, game.view().revision, 3);
    expect(game.view().phase).toBe('reveal');
    game.tick(4000);
    expect(game.view().round).toBe(round + 1);
    for (let n = 0; n < 2; n++) {
      game.act(
        'a',
        { type: 'rps', choice: 'rock' },
        game.view().revision,
        4001 + n * 4000,
      );
      game.act(
        'b',
        { type: 'rps', choice: 'scissors' },
        game.view().revision,
        4002 + n * 4000,
      );
      game.tick(8000 + n * 4000);
    }
    expect(game.view().phase).toBe('finished');
    expect(game.results().find((r) => r.userId === 'a')?.wins).toBe(1);
  });
  it('normalizes Hangman guesses without revealing the word to spectators', () => {
    const game = new GameSession({
      id: 'h',
      guildId: 'g',
      channelId: 'c',
      hostId: 'a',
      kind: 'hangman',
      word: 'Music',
      now: 0,
    });
    game.spectate('s');
    game.start('a', 1);
    expect(JSON.stringify(game.view())).not.toContain('Music');
    game.act('a', { type: 'guess', text: 'music' }, game.view().revision, 2);
    expect(game.view().phase).toBe('finished');
  });
  it('deals UNO privately, validates turns/cards, handles draw and keeps card conservation', () => {
    const game = new GameSession({
      id: 'u',
      guildId: 'g',
      channelId: 'c',
      hostId: 'a',
      kind: 'uno',
      now: 0,
      random: () => 0.2,
    });
    game.join('b');
    game.start('a', 1);
    expect(game.hand('a')).toHaveLength(7);
    expect(game.hand('b')).toHaveLength(7);
    expect(() => game.hand('s')).toThrow();
    expect(JSON.stringify(game.view())).not.toContain('hands');
    expect(() =>
      game.act('b', { type: 'draw' }, game.view().revision, 2),
    ).toThrow();
    game.act('a', { type: 'draw' }, game.view().revision, 2);
    expect(game.hand('a')).toHaveLength(8);
    expect(game.view().turn).toBe('b');
    expect(() =>
      game.act(
        'b',
        { type: 'card', cardId: 'forged' },
        game.view().revision,
        3,
      ),
    ).toThrow();
  });
  it('matches deterministic trivia answers, scores speed, rejects duplicates/stale rounds and reveals only afterward', () => {
    const game = new GameSession({
      id: 't',
      guildId: 'g',
      channelId: 'c',
      hostId: 'a',
      kind: 'musictrivia',
      tracks,
      rounds: 2,
      answerMode: 'both',
      now: 0,
    });
    game.join('b');
    game.spectate('s');
    game.start('a', 1);
    expect(JSON.stringify(game.view())).not.toContain('Around');
    expect(() =>
      game.act(
        's',
        { type: 'guess', text: 'Around the World', artist: 'Daft Punk' },
        game.view().revision,
        2,
      ),
    ).toThrow();
    game.act(
      'a',
      { type: 'guess', text: 'around-the world', artist: 'DAFT PUNK' },
      game.view().revision,
      1001,
    );
    expect(() =>
      game.act('a', { type: 'guess', text: 'x' }, game.view().revision, 1002),
    ).toThrow();
    game.act(
      'b',
      { type: 'guess', text: 'wrong', artist: 'Daft Punk' },
      game.view().revision,
      2001,
    );
    expect(game.view().reveal).toContain('Around the World');
    expect(game.view().scores.a).toBeGreaterThan(game.view().scores.b!);
    const stale = game.view().revision;
    game.tick(6000);
    expect(() =>
      game.act('b', { type: 'guess', text: 'Harder Better' }, stale, 6001),
    ).toThrow();
    game.tick(40000);
    game.tick(45000);
    expect(game.view().phase).toBe('finished');
    expect(game.results().find((r) => r.userId === 'a')).toMatchObject({
      correctSongs: 1,
      correctArtists: 1,
      correctAnswers: 1,
      bestStreak: 1,
    });
    expect(normalizeAnswer('Ready, OR not!')).toBe('ready or not');
  });
  it('times out rounds and abandons active sessions without timer objects in the domain', () => {
    const game = new GameSession({
      id: 't2',
      guildId: 'g',
      channelId: 'c',
      hostId: 'a',
      kind: 'musictrivia',
      tracks,
      rounds: 1,
      now: 0,
    });
    game.start('a', 1);
    game.tick(31000);
    expect(game.view().phase).toBe('reveal');
    game.tick(35000);
    expect(game.view().phase).toBe('finished');
  });
});

it('does not disclose trivia correctness through scores before round resolution', () => {
  const game = new GameSession({
    id: 'privacy',
    guildId: 'g',
    channelId: 'c',
    hostId: 'a',
    kind: 'musictrivia',
    tracks,
    rounds: 1,
    now: 0,
  });
  game.join('b');
  game.start('a', 1);
  game.act(
    'a',
    { type: 'guess', text: tracks[0]!.title },
    game.view().revision,
    2,
  );
  expect(game.view().scores.a).toBe(0);
});
it('records a completed Hangman loss without awarding winners', () => {
  const game = new GameSession({
    id: 'loss',
    guildId: 'g',
    channelId: 'c',
    hostId: 'a',
    kind: 'hangman',
    word: 'Music',
    now: 0,
  });
  game.start('a', 1);
  for (const text of ['a', 'b', 'd', 'e', 'f', 'g'])
    game.act('a', { type: 'guess', text }, game.view().revision, 2);
  expect(game.view().phase).toBe('finished');
  expect(game.results()[0]?.wins).toBe(0);
});
