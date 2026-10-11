import { describe, expect, it } from 'vitest';
import { PlaybackPolicyService } from '../apps/bot/src/services/PlaybackPolicyService.js';
import { normalizeGuildControls } from '../packages/data/src/GuildSettingsRepository.js';
const actor = {
  userId: 'u',
  voiceChannelId: 'v',
  botVoiceChannelId: 'v',
  administrator: false,
  roleIds: [] as string[],
  availableRoleIds: [] as string[],
};
describe('guild playback authorization', () => {
  const policy = new PlaybackPolicyService();
  it('requires same voice for collaborative actions', () => {
    expect(() =>
      policy.assert('skip', normalizeGuildControls(), {
        ...actor,
        voiceChannelId: undefined,
      }),
    ).toThrow(/voice/);
    expect(() =>
      policy.assert('stop', normalizeGuildControls(), {
        ...actor,
        voiceChannelId: 'other',
      }),
    ).toThrow(/same/);
  });
  it('allows everyone, administrators and configured existing DJs', () => {
    expect(() =>
      policy.assert('skip', normalizeGuildControls(), actor),
    ).not.toThrow();
    const settings = normalizeGuildControls({
      controlPolicy: 'dj',
      djRoleId: 'r',
    });
    expect(() =>
      policy.assert('stop', settings, { ...actor, administrator: true }),
    ).not.toThrow();
    expect(() =>
      policy.assert('stop', settings, {
        ...actor,
        roleIds: ['r'],
        availableRoleIds: ['r'],
      }),
    ).not.toThrow();
    expect(() =>
      policy.assert('stop', settings, { ...actor, roleIds: ['r'] }),
    ).toThrow();
    expect(() => policy.assert('stop', settings, actor)).toThrow();
  });
  it('allows requesters only on their entries and protects disruptive actions', () => {
    const settings = normalizeGuildControls({ controlPolicy: 'requester' });
    expect(() =>
      policy.assert('skip', settings, { ...actor, requestedBy: 'u' }),
    ).not.toThrow();
    expect(() =>
      policy.assert('remove', settings, { ...actor, requestedBy: 'other' }),
    ).toThrow();
    expect(() =>
      policy.assert('stop', settings, { ...actor, requestedBy: 'u' }),
    ).toThrow();
    expect(() =>
      policy.assert(
        'skip',
        normalizeGuildControls({ controlPolicy: 'admin' }),
        actor,
      ),
    ).toThrow();
    expect(() =>
      policy.assert(
        'skip',
        normalizeGuildControls({ controlPolicy: 'vote' }),
        actor,
      ),
    ).toThrow(/vote/);
  });
  it('checks channel allowlists/denylists and bounded cooldowns without reverse dependencies', () => {
    const settings = normalizeGuildControls({
      allowedTextChannels: ['yes'],
      blockedTextChannels: ['no'],
      cooldownSeconds: 2,
    });
    expect(() => policy.admit('g', 'u', 'play', 'no', settings, 0)).toThrow();
    policy.admit('g', 'u', 'play', 'yes', settings, 0);
    expect(() => policy.admit('g', 'u', 'play', 'yes', settings, 1999)).toThrow(
      /wait/,
    );
    expect(() =>
      policy.admit('g', 'u', 'play', 'yes', settings, 2000),
    ).not.toThrow();
    expect(() =>
      policy.admit('other', 'u', 'play', 'yes', settings, 0),
    ).not.toThrow();
  });
});

it('rechecks current text-channel policy for component mutations', async () => {
  const policy = new PlaybackPolicyService();
  const interaction = {
    guildId: 'g',
    channelId: '123456789012345678',
    user: { id: 'u' },
    guild: {
      members: { cache: new Map() },
      roles: { cache: new Map() },
      voiceStates: { cache: new Map([['u', { channelId: 'v' }]]) },
    },
  };
  await expect(
    policy.authorize(
      interaction as never,
      { voiceChannel: () => 'v' } as never,
      {
        get: async () => ({
          controls: { blockedTextChannels: ['123456789012345678'] },
        }),
      },
      'skip',
    ),
  ).rejects.toMatchObject({ code: 'CHANNEL_BLOCKED' });
});
