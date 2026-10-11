import { CommandError } from '../errors.js';
export interface VoteRequest {
  guildId: string;
  generation: number;
  userId: string;
  eligible: readonly string[];
  threshold: number;
  execute: () => Promise<unknown>;
}
interface Ballot {
  generation: number;
  votes: Set<string>;
  expires: number;
  passed: boolean;
}
export class VoteService {
  private readonly ballots = new Map<string, Ballot>();
  constructor(private readonly now: () => number = Date.now) {}
  private ballot(request: VoteRequest, create: boolean): Ballot | undefined {
    for (const [id, ballot] of this.ballots)
      if (ballot.expires <= this.now()) this.ballots.delete(id);
    let ballot = this.ballots.get(request.guildId);
    if (ballot?.generation !== request.generation) {
      this.ballots.delete(request.guildId);
      ballot = undefined;
    }
    if (!ballot && create) {
      if (this.ballots.size >= 1000)
        this.ballots.delete(this.ballots.keys().next().value!);
      ballot = {
        generation: request.generation,
        votes: new Set(),
        expires: this.now() + 60000,
        passed: false,
      };
      this.ballots.set(request.guildId, ballot);
    }
    if (ballot)
      for (const user of ballot.votes)
        if (!request.eligible.includes(user)) ballot.votes.delete(user);
    return ballot;
  }
  private async result(request: VoteRequest, ballot: Ballot) {
    if (
      !Number.isFinite(request.threshold) ||
      request.threshold < 0.1 ||
      request.threshold > 1
    )
      throw new CommandError('INVALID_SETTING', 'Invalid skip-vote threshold.');
    const required = Math.max(
      1,
      Math.ceil(new Set(request.eligible).size * request.threshold),
    );
    if (
      !ballot.passed &&
      request.eligible.length > 0 &&
      ballot.votes.size >= required
    ) {
      ballot.passed = true;
      try {
        await request.execute();
      } catch (error) {
        this.ballots.delete(request.guildId);
        throw error;
      }
    }
    return { passed: ballot.passed, votes: ballot.votes.size, required };
  }
  async cast(request: VoteRequest) {
    if (!request.eligible.includes(request.userId))
      throw new CommandError(
        'USER_NOT_IN_VOICE',
        'Only listeners in Kairo voice channel can vote.',
      );
    const ballot = this.ballot(request, true)!;
    if (ballot.votes.has(request.userId))
      throw new CommandError(
        'VOTE_ALREADY_CAST',
        'You already voted to skip this song.',
      );
    if (!ballot.passed) ballot.votes.add(request.userId);
    return this.result(request, ballot);
  }
  async reconcile(request: VoteRequest) {
    const ballot = this.ballot(request, false);
    if (!request.eligible.length) {
      this.cancel(request.guildId);
      return;
    }
    if (ballot) return this.result(request, ballot);
  }
  cancel(guildId: string) {
    this.ballots.delete(guildId);
  }
  clear() {
    this.ballots.clear();
  }
}
