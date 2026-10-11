import { describe, expect, it, vi } from 'vitest';
import { VoteService } from '../apps/bot/src/services/VoteService.js';
describe('generation-scoped skip voting', () => {
  it('accepts each eligible human once and executes exactly once under simultaneous votes', async () => {
    const votes = new VoteService();
    const skip = vi.fn(async () => {});
    const request = {
      guildId: 'g',
      generation: 1,
      userId: 'a',
      eligible: ['a', 'b', 'c'],
      threshold: 0.5,
      execute: skip,
    };
    expect(await votes.cast(request)).toMatchObject({
      passed: false,
      votes: 1,
      required: 2,
    });
    await expect(votes.cast(request)).rejects.toMatchObject({
      code: 'VOTE_ALREADY_CAST',
    });
    await Promise.all([
      votes.cast({ ...request, userId: 'b' }),
      votes.cast({ ...request, userId: 'c' }),
    ]);
    expect(skip).toHaveBeenCalledOnce();
  });
  it('rejects outsiders, expires changed generations and recalculates when listeners leave', async () => {
    const votes = new VoteService();
    const skip = vi.fn(async () => {});
    const request = {
      guildId: 'g',
      generation: 1,
      userId: 'a',
      eligible: ['a', 'b', 'c', 'd'],
      threshold: 0.75,
      execute: skip,
    };
    await expect(
      votes.cast({ ...request, userId: 'bot' }),
    ).rejects.toMatchObject({ code: 'USER_NOT_IN_VOICE' });
    await votes.cast(request);
    await votes.cast({ ...request, userId: 'b' });
    await votes.reconcile({ ...request, eligible: ['a', 'b'] });
    expect(skip).toHaveBeenCalledOnce();
    expect(await votes.cast({ ...request, generation: 2 })).toMatchObject({
      passed: false,
      votes: 1,
    });
  });
  it('expires idle votes and never passes with zero humans', async () => {
    let now = 0;
    const votes = new VoteService(() => now);
    const skip = vi.fn(async () => {});
    const request = {
      guildId: 'g',
      generation: 1,
      userId: 'a',
      eligible: ['a', 'b'],
      threshold: 1,
      execute: skip,
    };
    await votes.cast(request);
    now = 60001;
    await votes.cast({ ...request, userId: 'b' });
    expect(skip).not.toHaveBeenCalled();
    await votes.reconcile({ ...request, eligible: [] });
    expect(skip).not.toHaveBeenCalled();
  });
});
