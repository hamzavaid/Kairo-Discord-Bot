import { normalizeGuildControls, type GuildControls } from '@kairo/data';
import { PermissionFlagsBits, type RepliableInteraction } from 'discord.js';
import { CommandError } from '../errors.js';
import type { MusicService } from './MusicService.js';
export type PlaybackAction =
  | 'pause'
  | 'resume'
  | 'skip'
  | 'stop'
  | 'disconnect'
  | 'previous'
  | 'shuffle'
  | 'remove'
  | 'move'
  | 'clear'
  | 'volume'
  | 'filter'
  | 'repeat';
export interface ControlActor {
  userId: string;
  voiceChannelId: string | undefined;
  botVoiceChannelId: string | undefined;
  administrator: boolean;
  roleIds: readonly string[];
  availableRoleIds: readonly string[];
  requestedBy?: string;
}
const disruptive = new Set<PlaybackAction>([
  'stop',
  'disconnect',
  'clear',
  'shuffle',
  'volume',
  'filter',
  'repeat',
]);
export class PlaybackPolicyService {
  private readonly cooldowns = new Map<string, number>();
  assert(
    action: PlaybackAction,
    controls: GuildControls,
    actor: ControlActor,
  ): void {
    if (!actor.voiceChannelId)
      throw new CommandError(
        'USER_NOT_IN_VOICE',
        'Join a voice channel first.',
      );
    if (
      actor.botVoiceChannelId &&
      actor.botVoiceChannelId !== actor.voiceChannelId
    )
      throw new CommandError(
        'WRONG_VOICE_CHANNEL',
        'Join the same voice channel as Kairo.',
      );
    const isDj =
      controls.djRoleId !== null &&
      actor.availableRoleIds.includes(controls.djRoleId) &&
      actor.roleIds.includes(controls.djRoleId);
    if (actor.administrator || isDj) return;
    const mode = controls.controlPolicy;
    if (mode === 'everyone') return;
    if (
      mode === 'requester' &&
      !disruptive.has(action) &&
      actor.requestedBy === actor.userId
    )
      return;
    if (mode === 'vote' && action === 'skip')
      throw new CommandError('VOTE_REQUIRED', 'Cast a skip vote with /vote.');
    throw new CommandError(
      'DJ_PERMISSION_REQUIRED',
      'A server administrator or DJ must perform this action.',
    );
  }
  admit(
    guildId: string,
    userId: string,
    command: string,
    channelId: string | null,
    controls: GuildControls,
    now = Date.now(),
  ): void {
    if (['settings', 'auditlog', 'help', 'ping'].includes(command)) return;
    if (
      channelId &&
      (controls.blockedTextChannels.includes(channelId) ||
        (controls.allowedTextChannels.length > 0 &&
          !controls.allowedTextChannels.includes(channelId)))
    )
      throw new CommandError(
        'CHANNEL_BLOCKED',
        'Music commands are not enabled in this text channel.',
      );
    if (
      ![
        'play',
        'playnext',
        'info',
        'search',
        'recommend',
        'discover',
        'lyrics',
        'playlist',
      ].includes(command)
    )
      return;
    for (const [key, expires] of this.cooldowns)
      if (expires <= now) this.cooldowns.delete(key);
    const key = `${guildId}:${userId}`;
    if ((this.cooldowns.get(key) ?? -1) > now)
      throw new CommandError(
        'COMMAND_COOLDOWN',
        'Please wait before another music lookup.',
      );
    if (this.cooldowns.size >= 10000)
      this.cooldowns.delete(this.cooldowns.keys().next().value!);
    this.cooldowns.set(key, now + controls.cooldownSeconds * 1000);
  }
  async authorize(
    interaction: Pick<
      RepliableInteraction,
      'guildId' | 'guild' | 'user' | 'memberPermissions'
    > &
      Partial<Pick<RepliableInteraction, 'channelId'>>,
    music: MusicService,
    settings: {
      get(id: string): Promise<{ controls?: Partial<GuildControls> }>;
    },
    action: PlaybackAction,
    requestedBy?: string,
  ): Promise<void> {
    if (!interaction.guildId)
      throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const controls = normalizeGuildControls(
      (await settings.get(interaction.guildId)).controls,
    );
    this.admit(
      interaction.guildId,
      interaction.user.id,
      'control',
      interaction.channelId ?? null,
      controls,
    );
    this.assert(action, controls, {
      userId: interaction.user.id,
      voiceChannelId:
        interaction.guild?.voiceStates.cache.get(interaction.user.id)
          ?.channelId ?? undefined,
      botVoiceChannelId: music.voiceChannel(interaction.guildId),
      administrator:
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ===
          true ||
        interaction.memberPermissions?.has(
          PermissionFlagsBits.Administrator,
        ) === true,
      roleIds: member ? [...member.roles.cache.keys()] : [],
      availableRoleIds: interaction.guild
        ? [...interaction.guild.roles.cache.keys()]
        : [],
      ...(requestedBy ? { requestedBy } : {}),
    });
  }
}
