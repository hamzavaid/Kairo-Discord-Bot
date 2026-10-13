import { deck, shuffle, COLORS, type UnoCard } from '../uno/deck.js';
import { normalizeAnswer, triviaAnswer } from '../trivia/answers.js';
import {
  GAME_KINDS,
  requireGame,
  type GameOptions,
  type GamePhase,
  type GameAction,
  type GameView,
  type GameResult,
} from './types.js';
export class GameSession {
  private phase: GamePhase = 'lobby';
  private revision = 0;
  private round = 0;
  private started = 0;
  private deadline: number;
  private readonly players: string[];
  private readonly spectators = new Set<string>();
  private readonly scores = new Map<string, number>();
  private readonly metrics = new Map<
    string,
    Omit<
      GameResult,
      | 'sessionId'
      | 'guildId'
      | 'userId'
      | 'game'
      | 'playedAt'
      | 'wins'
      | 'points'
    >
  >();
  private readonly streaks = new Map<string, number>();
  private readonly choices = new Map<string, string>();
  private readonly guesses = new Set<string>();
  private winners: string[] = [];
  private reveal: string | undefined;
  private trackIndex = 0;
  private readonly hands = new Map<string, UnoCard[]>();
  private drawPile: UnoCard[] = [];
  private discard: UnoCard[] = [];
  private direction = 1;
  private turnIndex = 0;
  private color = '';
  private drawStack = 0;
  private readonly letters = new Set<string>();
  private mistakes = 0;
  constructor(readonly options: GameOptions) {
    requireGame(
      GAME_KINDS.includes(options.kind) && !!options.id && !!options.hostId,
      'GAME_INVALID',
      'Invalid game configuration.',
    );
    requireGame(
      Number.isFinite(options.now) &&
        (options.rounds === undefined ||
          (Number.isInteger(options.rounds) &&
            options.rounds >= 1 &&
            options.rounds <= 20)),
      'GAME_INVALID',
      'Choose 1-20 rounds.',
    );
    requireGame(
      options.bestOf === undefined || [1, 3, 5, 7, 9].includes(options.bestOf),
      'GAME_INVALID',
      'Choose an odd best-of from 1 to 9.',
    );
    for (const [value, min, max] of [
      [options.lobbyMs ?? 120000, 1000, 300000],
      [options.turnMs ?? 45000, 1000, 120000],
      [options.answerMs ?? 30000, 1000, 60000],
      [options.lifetimeMs ?? 900000, 1000, 1800000],
    ])
      requireGame(
        value! >= min! && value! <= max!,
        'GAME_INVALID',
        'Invalid game timeout.',
      );
    requireGame(
      options.answerMode === undefined ||
        ['song', 'artist', 'both'].includes(options.answerMode),
      'GAME_INVALID',
      'Invalid answer mode.',
    );
    this.players = [options.hostId];
    this.scores.set(options.hostId, 0);
    this.deadline = options.now + (options.lobbyMs ?? 120000);
  }
  private metric(user: string) {
    let m = this.metrics.get(user);
    if (!m) {
      m = {
        roundsWon: 0,
        correctSongs: 0,
        correctArtists: 0,
        correctAnswers: 0,
        attempts: 0,
        bestStreak: 0,
      };
      this.metrics.set(user, m);
    }
    return m;
  }
  join(user: string) {
    requireGame(this.phase === 'lobby', 'GAME_FINISHED', 'Joining is closed.');
    requireGame(
      !this.players.includes(user),
      'GAME_DUPLICATE',
      'You already joined.',
    );
    requireGame(
      this.players.length < (this.options.kind === 'rps' ? 2 : 10),
      'GAME_BUSY',
      'The lobby is full.',
    );
    requireGame(
      this.options.kind !== 'rps' ||
        !this.options.invitedUserId ||
        user === this.options.invitedUserId,
      'GAME_FORBIDDEN',
      'This challenge is reserved for the invited player.',
    );
    this.spectators.delete(user);
    this.players.push(user);
    this.scores.set(user, 0);
    this.revision++;
  }
  spectate(user: string) {
    requireGame(
      !this.players.includes(user),
      'GAME_FORBIDDEN',
      'Players already have a seat.',
    );
    requireGame(
      this.spectators.size < 100,
      'GAME_BUSY',
      'Spectator limit reached.',
    );
    this.spectators.add(user);
  }
  start(user: string, now: number) {
    this.tick(now);
    requireGame(
      user === this.options.hostId && this.phase === 'lobby',
      'GAME_FORBIDDEN',
      'Only the host can start the lobby.',
    );
    requireGame(
      this.players.length >=
        (this.options.kind === 'rps' || this.options.kind === 'uno' ? 2 : 1),
      'GAME_INVALID',
      'More players must join first.',
    );
    requireGame(
      this.options.kind !== 'musictrivia' || !!this.options.tracks?.length,
      'GAME_INVALID',
      'No trivia tracks are available.',
    );
    this.started = now;
    this.round = 1;
    if (this.options.kind === 'uno') {
      this.drawPile = deck(this.options.random ?? Math.random);
      for (const p of this.players) this.hands.set(p, this.take(7));
      const index = this.drawPile.findIndex((c) => /^\d$/u.test(c.value));
      this.discard.push(this.drawPile.splice(index, 1)[0]!);
      this.color = this.discard[0]!.color;
    }
    requireGame(
      this.options.kind !== 'hangman' ||
        /^[a-zA-Z -]{3,60}$/u.test(this.options.word ?? ''),
      'GAME_INVALID',
      'No valid puzzle is available.',
    );
    this.begin(now);
  }
  private begin(now: number) {
    this.phase =
      this.options.kind === 'musictrivia' && this.options.manualPreview
        ? 'preparing'
        : 'active';
    this.revision++;
    this.choices.clear();
    this.guesses.clear();
    this.reveal = undefined;
    this.roundStarted = now;
    this.deadline =
      now +
      (this.options.kind === 'musictrivia' || this.options.kind === 'rps'
        ? (this.options.answerMs ?? 30000)
        : (this.options.turnMs ?? 45000));
  }
  private roundStarted = 0;
  previewReady(now: number) {
    requireGame(
      this.phase === 'preparing',
      'GAME_STALE',
      'This round changed.',
    );
    this.phase = 'active';
    this.roundStarted = now;
    this.deadline = now + (this.options.answerMs ?? 30000);
    this.revision++;
  }
  triviaTrack() {
    requireGame(
      this.options.kind === 'musictrivia',
      'GAME_INVALID',
      'Not a trivia session.',
    );
    return this.options.tracks![this.trackIndex % this.options.tracks!.length]!;
  }
  skipUnavailable(now: number) {
    this.tick(now);
    requireGame(
      this.phase === 'preparing',
      'GAME_STALE',
      'This round changed.',
    );
    this.trackIndex++;
    this.unavailable++;
    if (this.unavailable >= (this.options.tracks?.length ?? 0))
      this.end('abandoned');
  }
  private unavailable = 0;
  decline(user: string) {
    requireGame(
      this.options.kind === 'rps' &&
        this.options.invitedUserId === user &&
        this.phase === 'lobby',
      'GAME_FORBIDDEN',
      'Only the invited player can decline this pending challenge.',
    );
    this.end('abandoned');
  }
  stop(user: string) {
    requireGame(
      user === this.options.hostId,
      'GAME_FORBIDDEN',
      'Only the host can end this game.',
    );
    if (this.phase === 'finished' || this.phase === 'abandoned') return;
    this.end('abandoned');
  }
  private end(phase: 'finished' | 'abandoned') {
    this.phase = phase;
    this.revision++;
    if (phase === 'finished') {
      const best = Math.max(...this.scores.values());
      this.winners = this.players.filter(
        (p) => this.scores.get(p) === best && best > 0,
      );
    }
  }
  private take(count: number) {
    const cards: UnoCard[] = [];
    for (let n = 0; n < count; n++) {
      if (!this.drawPile.length && this.discard.length > 1) {
        const top = this.discard.pop()!;
        this.drawPile = shuffle(
          this.discard,
          this.options.random ?? Math.random,
        );
        this.discard = [top];
      }
      const c = this.drawPile.pop();
      if (c) cards.push(c);
    }
    return cards;
  }
  hand(user: string): UnoCard[] {
    requireGame(
      this.players.includes(user) &&
        this.options.kind === 'uno' &&
        this.phase !== 'lobby',
      'GAME_FORBIDDEN',
      'Only seated players can view their own hand.',
    );
    return structuredClone(this.hands.get(user) ?? []);
  }
  private next(steps: number, now: number) {
    this.turnIndex =
      (this.turnIndex + this.direction * steps + this.players.length * 3) %
      this.players.length;
    this.deadline = now + (this.options.turnMs ?? 45000);
    this.revision++;
  }
  private canPlay(card: UnoCard) {
    return (
      card.color === 'wild' ||
      card.color === this.color ||
      card.value === this.discard.at(-1)?.value
    );
  }
  act(user: string, action: GameAction, revision: number, now: number) {
    this.tick(now);
    requireGame(
      this.phase === 'active',
      'GAME_FINISHED',
      'The guessing window or turn is closed.',
    );
    requireGame(
      this.players.includes(user),
      'GAME_FORBIDDEN',
      'Spectators cannot submit scored actions.',
    );
    requireGame(
      revision === this.revision,
      'GAME_STALE',
      'This game changed; refresh before acting.',
    );
    if (this.options.kind === 'rps') {
      requireGame(
        action.type === 'rps' &&
          ['rock', 'paper', 'scissors'].includes(action.choice),
        'GAME_INVALID',
        'Choose rock, paper or scissors.',
      );
      requireGame(
        !this.choices.has(user),
        'GAME_DUPLICATE',
        'You already chose.',
      );
      this.choices.set(user, action.choice);
      if (this.choices.size === this.players.length) this.resolve(now);
    } else if (this.options.kind === 'musictrivia') {
      requireGame(
        action.type === 'guess' &&
          action.text.length <= 200 &&
          (action.artist?.length ?? 0) <= 200,
        'GAME_INVALID',
        'Enter a short answer.',
      );
      requireGame(
        !this.guesses.has(user),
        'GAME_DUPLICATE',
        'Only one guess per round.',
      );
      this.guesses.add(user);
      const m = this.metric(user);
      m.attempts++;
      const result = triviaAnswer(
        this.triviaTrack(),
        action.text,
        action.artist ?? action.text,
        this.options.answerMode ?? 'song',
        now - this.roundStarted,
        this.options.answerMs ?? 30000,
      );
      this.scores.set(user, this.scores.get(user)! + result.points);
      if (result.songCorrect) m.correctSongs++;
      if (result.artistCorrect) m.correctArtists++;
      if (result.correct) {
        m.correctAnswers++;
        const streak = (this.streaks.get(user) ?? 0) + 1;
        this.streaks.set(user, streak);
        m.bestStreak = Math.max(m.bestStreak, streak);
      } else this.streaks.set(user, 0);
      if (this.guesses.size === this.players.length) this.resolve(now);
    } else if (this.options.kind === 'hangman') {
      requireGame(
        action.type === 'guess',
        'GAME_INVALID',
        'Enter a letter or word.',
      );
      const guess = normalizeAnswer(action.text);
      requireGame(
        /^[a-z ]{1,60}$/u.test(guess),
        'GAME_INVALID',
        'Use a letter or word.',
      );
      const word = this.options.word!.toLowerCase();
      const good =
        guess === word || (guess.length === 1 && word.includes(guess));
      if (guess.length === 1) {
        requireGame(
          !this.letters.has(guess),
          'GAME_DUPLICATE',
          'That letter was already guessed.',
        );
        this.letters.add(guess);
      }
      if (good)
        this.scores.set(
          user,
          this.scores.get(user)! + (guess.length > 1 ? 5 : 1),
        );
      else this.mistakes++;
      this.revision++;
      this.deadline = now + (this.options.turnMs ?? 45000);
      if (
        guess === word ||
        [...word].every((c) => !/[a-z]/u.test(c) || this.letters.has(c)) ||
        this.mistakes >= 6
      ) {
        this.reveal = this.options.word;
        if (good) {
          this.metric(user).roundsWon++;
          this.end('finished');
        } else {
          this.end('finished');
          this.winners = [];
        }
      }
    } else {
      requireGame(
        this.players[this.turnIndex] === user,
        'GAME_FORBIDDEN',
        'Wait for your turn.',
      );
      const hand = this.hands.get(user)!;
      if (action.type === 'draw') {
        let count = this.drawStack || 1;
        this.drawStack = 0;
        hand.push(...this.take(count));
        if (this.options.drawUntilPlayable) {
          while (
            !hand.some((c) => this.canPlay(c)) &&
            count++ < 108 &&
            this.drawPile.length + this.discard.length > 1
          )
            hand.push(...this.take(1));
        }
        this.next(1, now);
      } else {
        requireGame(
          action.type === 'card',
          'GAME_INVALID',
          'Choose a card or draw.',
        );
        const index = hand.findIndex((c) => c.id === action.cardId);
        requireGame(
          index >= 0,
          'GAME_INVALID',
          'Choose a card from your hand.',
        );
        const card = hand[index]!;
        requireGame(
          this.canPlay(card),
          'GAME_INVALID',
          'This card does not match.',
        );
        requireGame(
          !this.drawStack ||
            (this.options.stackDrawTwo && card.value === 'draw2'),
          'GAME_INVALID',
          'Draw the pending penalty.',
        );
        if (card.value === 'wild4')
          requireGame(
            !hand.some((c) => c.color === this.color),
            'GAME_INVALID',
            'Wild Draw Four requires no matching color.',
          );
        if (card.color === 'wild')
          requireGame(
            COLORS.includes(action.color as (typeof COLORS)[number]),
            'GAME_INVALID',
            'Choose red, yellow, green or blue.',
          );
        hand.splice(index, 1);
        this.discard.push(card);
        this.color = card.color === 'wild' ? action.color! : card.color;
        if (hand.length === 1 && !action.uno) hand.push(...this.take(2));
        if (!hand.length) {
          this.scores.set(user, 1);
          this.metric(user).roundsWon++;
          this.end('finished');
          return;
        }
        let steps = 1;
        if (card.value === 'reverse') {
          this.direction *= -1;
          if (this.players.length === 2) steps = 2;
        }
        if (card.value === 'skip') steps = 2;
        if (card.value === 'draw2' || card.value === 'wild4') {
          const count = card.value === 'draw2' ? 2 : 4;
          if (card.value === 'draw2' && this.options.stackDrawTwo)
            this.drawStack += count;
          else {
            const target =
              this.players[
                (this.turnIndex + this.direction + this.players.length) %
                  this.players.length
              ]!;
            this.hands.get(target)!.push(...this.take(count));
            steps = 2;
          }
        }
        this.next(steps, now);
      }
    }
  }
  private resolve(now: number) {
    if (this.options.kind === 'rps') {
      const [a, b] = this.players;
      const ac = this.choices.get(a!),
        bc = this.choices.get(b!);
      let winner: string | undefined;
      if (
        ac &&
        (!bc ||
          (ac !== bc &&
            (
              { rock: 'scissors', paper: 'rock', scissors: 'paper' } as Record<
                string,
                string
              >
            )[ac] === bc))
      )
        winner = a;
      else if (bc && ac !== bc) winner = b;
      if (winner) {
        this.scores.set(winner, this.scores.get(winner)! + 1);
        this.metric(winner).roundsWon++;
      }
      this.reveal = this.players
        .map((p) => `${p}: ${this.choices.get(p) ?? 'no answer'}`)
        .join(' | ');
    } else {
      const track = this.triviaTrack();
      this.reveal = `${track.title} - ${track.artists.join(', ')}`;
      const best = Math.max(
        ...this.players.map(
          (p) => this.scores.get(p)! - (this.beforeRound.get(p) ?? 0),
        ),
      );
      for (const p of this.players) {
        if (
          best > 0 &&
          this.scores.get(p)! - (this.beforeRound.get(p) ?? 0) === best
        )
          this.metric(p).roundsWon++;
        if (!this.guesses.has(p)) this.streaks.set(p, 0);
      }
    }
    this.phase = 'reveal';
    this.deadline = now + 3000;
    this.revision++;
  }
  private beforeRound = new Map<string, number>();
  tick(now: number) {
    if (this.phase === 'finished' || this.phase === 'abandoned') return;
    if (now - this.options.now >= (this.options.lifetimeMs ?? 900000)) {
      this.end('abandoned');
      return;
    }
    if (now < this.deadline) return;
    if (this.phase === 'lobby' || this.phase === 'preparing') {
      this.end('abandoned');
      return;
    }
    if (this.phase === 'reveal') {
      const done =
        this.options.kind === 'rps'
          ? Math.max(...this.scores.values()) >=
              Math.ceil((this.options.bestOf ?? 3) / 2) || this.round >= 30
          : this.round >= (this.options.rounds ?? 5);
      if (done) this.end('finished');
      else {
        this.round++;
        this.trackIndex++;
        this.beforeRound = new Map(this.scores);
        this.begin(now);
      }
      return;
    }
    if (this.options.kind === 'rps' || this.options.kind === 'musictrivia')
      this.resolve(now);
    else if (this.options.kind === 'uno') {
      const p = this.players[this.turnIndex]!;
      this.hands.get(p)!.push(...this.take(this.drawStack || 1));
      this.drawStack = 0;
      this.next(1, now);
    } else this.end('abandoned');
  }
  view(): GameView {
    return {
      id: this.options.id,
      kind: this.options.kind,
      hostId: this.options.hostId,
      ...(this.options.invitedUserId
        ? { invitedUserId: this.options.invitedUserId }
        : {}),
      phase: this.phase,
      revision: this.revision,
      round: this.round,
      ...(this.options.kind === 'musictrivia'
        ? { roundLimit: this.options.rounds ?? 5 }
        : {}),
      players: [...this.players],
      spectators: [...this.spectators],
      scores: Object.fromEntries(
        this.options.kind === 'musictrivia' &&
          ['active', 'preparing'].includes(this.phase)
          ? this.players.map((p) => [p, this.beforeRound.get(p) ?? 0])
          : this.scores,
      ),
      deadline: this.deadline,
      winners: [...this.winners],
      ...(this.reveal ? { reveal: this.reveal } : {}),
      ...(this.options.kind === 'uno' && this.discard.length
        ? {
            turn: this.players[this.turnIndex]!,
            table: `${this.color} ${this.discard.at(-1)!.value}${this.drawStack ? ` / draw ${this.drawStack}` : ''}`,
            counts: Object.fromEntries(
              [...this.hands].map(([p, h]) => [p, h.length]),
            ),
          }
        : {}),
      ...(this.options.kind === 'hangman' && this.phase !== 'lobby'
        ? {
            maskedWord: [...this.options.word!]
              .map((c) =>
                /[a-z]/iu.test(c) &&
                !this.letters.has(c.toLowerCase()) &&
                !this.reveal
                  ? '_'
                  : c,
              )
              .join(' '),
            mistakes: this.mistakes,
          }
        : {}),
    };
  }
  results(): GameResult[] {
    return this.phase === 'finished'
      ? this.players.map((userId) => ({
          sessionId: this.options.id,
          guildId: this.options.guildId,
          userId,
          game: this.options.kind,
          playedAt: new Date(this.started),
          wins: this.winners.includes(userId) ? 1 : 0,
          points: this.scores.get(userId)!,
          ...this.metric(userId),
        }))
      : [];
  }
}
export class GameManager {
  private readonly sessions = new Map<string, GameSession>();
  create(options: GameOptions) {
    const key = `${options.guildId}:${options.channelId}`;
    const prior = this.sessions.get(key);
    requireGame(
      !prior || ['finished', 'abandoned'].includes(prior.view().phase),
      'GAME_BUSY',
      'A game is already active in this channel.',
    );
    requireGame(
      this.sessions.size < 500 || this.sessions.has(key),
      'GAME_BUSY',
      'Game capacity reached.',
    );
    const session = new GameSession(options);
    this.sessions.set(key, session);
    return session;
  }
  get(guildId: string, channelId: string) {
    const session = this.sessions.get(`${guildId}:${channelId}`);
    requireGame(
      session,
      'GAME_NOT_FOUND',
      'No game is active in this channel.',
    );
    return session;
  }
  release(session: GameSession) {
    const key = `${session.options.guildId}:${session.options.channelId}`;
    if (this.sessions.get(key) === session) this.sessions.delete(key);
  }
}
