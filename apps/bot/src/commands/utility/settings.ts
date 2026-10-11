import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  normalizeGuildControls,
  validateGuildControls,
  validateIdleDisconnectSeconds,
  validateAudioQuality,
  CONTROL_POLICIES,
  FILTER_PRESETS,
  type AudioQuality,
  type GuildControls,
} from '@kairo/data';
import { CommandError } from '../../errors.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Show or change this server’s empty-channel timeout')
    .addIntegerOption((option) =>
      option
        .setName('timeout_seconds')
        .setDescription(
          'Seconds before leaving an empty voice channel; 0 disables (maximum 3600)',
        )
        .setMinValue(0)
        .setMaxValue(3600),
    )
    .addStringOption((option) =>
      option
        .setName('audio_quality')
        .setDescription('Playback audio quality')
        .addChoices(
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Best', value: 'best' },
        ),
    )
    .addIntegerOption((o) =>
      o
        .setName('default_volume')
        .setDescription('Default session volume (0-100)')
        .setMinValue(0)
        .setMaxValue(100),
    )
    .addStringOption((o) =>
      o
        .setName('default_repeat')
        .setDescription('Default repeat mode')
        .addChoices(
          ...['off', 'track', 'queue'].map((value) => ({ name: value, value })),
        ),
    )
    .addStringOption((o) =>
      o
        .setName('default_filter')
        .setDescription('Trusted filter for subsequent tracks')
        .addChoices(...FILTER_PRESETS.map((value) => ({ name: value, value }))),
    )
    .addBooleanOption((o) =>
      o
        .setName('autoplay')
        .setDescription('Enable radio when the manual queue ends'),
    )
    .addRoleOption((o) =>
      o.setName('dj_role').setDescription('Role allowed to control playback'),
    )
    .addBooleanOption((o) =>
      o
        .setName('clear_dj_role')
        .setDescription('Remove the configured DJ role'),
    )
    .addStringOption((o) =>
      o
        .setName('control_policy')
        .setDescription('Who may control playback')
        .addChoices(
          ...CONTROL_POLICIES.map((value) => ({ name: value, value })),
        ),
    )
    .addNumberOption((o) =>
      o
        .setName('vote_threshold')
        .setDescription('Fraction of listeners required for skip (0.1-1)')
        .setMinValue(0.1)
        .setMaxValue(1),
    )
    .addIntegerOption((o) =>
      o
        .setName('cooldown_seconds')
        .setDescription('Delay between expensive lookups (0-60)')
        .setMinValue(0)
        .setMaxValue(60),
    )
    .addStringOption((o) =>
      o
        .setName('allowed_channels')
        .setDescription(
          'Comma-separated text channel IDs; none removes restriction',
        ),
    )
    .addStringOption((o) =>
      o
        .setName('blocked_channels')
        .setDescription('Comma-separated blocked channel IDs; none clears'),
    ),
  usage: '/settings [timeout_seconds] [audio_quality]',
  category: 'Utility',
  async execute(interaction, context) {
    const guildId = guild(interaction);
    const timeoutSeconds = interaction.options.getInteger('timeout_seconds');
    const audioQuality = interaction.options.getString(
      'audio_quality',
    ) as AudioQuality | null;

    const patch: Partial<GuildControls> = {};
    const volume = interaction.options.getInteger('default_volume');
    const repeat = interaction.options.getString('default_repeat');
    const filter = interaction.options.getString('default_filter');
    const autoplay = interaction.options.getBoolean?.('autoplay');
    const role = interaction.options.getRole?.('dj_role');
    const clearRole = interaction.options.getBoolean?.('clear_dj_role');
    const policy = interaction.options.getString('control_policy');
    const threshold = interaction.options.getNumber?.('vote_threshold');
    const cooldown = interaction.options.getInteger('cooldown_seconds');
    if (volume != null) patch.volume = volume;
    if (repeat != null) patch.repeat = repeat as GuildControls['repeat'];
    if (filter != null) patch.filter = filter as GuildControls['filter'];
    if (autoplay != null) patch.autoplay = autoplay;
    if (role) patch.djRoleId = role.id;
    if (clearRole) patch.djRoleId = null;
    if (policy != null)
      patch.controlPolicy = policy as GuildControls['controlPolicy'];
    if (threshold != null) patch.voteThreshold = threshold;
    if (cooldown != null) patch.cooldownSeconds = cooldown;
    for (const [option, key] of [
      ['allowed_channels', 'allowedTextChannels'],
      ['blocked_channels', 'blockedTextChannels'],
    ] as const) {
      const value = interaction.options.getString(option);
      if (value != null)
        patch[key] =
          value.trim().toLowerCase() === 'none'
            ? []
            : value.split(',').map((id) => id.trim());
    }
    if (
      timeoutSeconds !== null ||
      audioQuality !== null ||
      Object.keys(patch).length > 0
    ) {
      const canManageGuild =
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
        false;

      if (!canManageGuild && !context.isDeveloper)
        throw new CommandError(
          'UNAUTHORIZED',
          'Manage Server permission is required to change settings.',
        );

      try {
        validateGuildControls(patch);
        if (timeoutSeconds !== null)
          validateIdleDisconnectSeconds(timeoutSeconds);
        if (audioQuality !== null) validateAudioQuality(audioQuality);
      } catch (error) {
        if (error instanceof RangeError)
          throw new CommandError(
            'INVALID_SETTING',
            'Invalid guild setting value.',
          );
        throw error;
      }
      if (Object.keys(patch).length && !context.settings.setControls)
        throw new CommandError(
          'INVALID_SETTING',
          'Advanced settings storage is unavailable.',
        );
      if (timeoutSeconds !== null)
        await context.settings.setIdleDisconnectSeconds(
          guildId,
          timeoutSeconds,
        );
      if (audioQuality !== null)
        await context.settings.setAudioQuality(guildId, audioQuality);
      if (Object.keys(patch).length) {
        if (!context.settings.setControls)
          throw new CommandError(
            'UNAUTHORIZED',
            'Advanced settings storage is unavailable.',
          );
        try {
          await context.settings.setControls(guildId, patch);
        } catch (error) {
          if (error instanceof RangeError)
            throw new CommandError(
              'INVALID_SETTING',
              'Invalid guild setting value.',
            );
          throw error;
        }
      }
      await context.onSettingsChanged?.(guildId);
    }

    const current = await context.settings.get(guildId);
    const controls = normalizeGuildControls(current.controls);
    await interaction.reply({
      content:
        `Audio quality: ${current.audioQuality}.\n` +
        `Defaults: volume ${controls.volume}%, repeat ${controls.repeat}, filter ${controls.filter}. Autoplay: ${controls.autoplay ? 'on' : 'off'}.\n` +
        `Control policy: ${controls.controlPolicy}. DJ role: ${controls.djRoleId ? `<@&${controls.djRoleId}>` : 'none'}. Skip votes: ${Math.round(controls.voteThreshold * 100)}%. Lookup cooldown: ${controls.cooldownSeconds}s.\n` +
        (current.idleDisconnectSeconds === 0
          ? 'Empty-channel auto-disconnect: disabled.'
          : `Empty-channel auto-disconnect: ${current.idleDisconnectSeconds} seconds.`),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
