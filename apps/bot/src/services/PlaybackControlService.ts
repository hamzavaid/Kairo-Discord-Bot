import {
  normalizeGuildControls,
  type GuildSettingsRepository,
} from '@kairo/data';
import type { RepliableInteraction } from 'discord.js';
import { CommandError } from '../errors.js';
import type { MusicService } from './MusicService.js';
import {
  PlaybackPolicyService,
  type PlaybackAction,
} from './PlaybackPolicyService.js';
import { VoteService } from './VoteService.js';
export class PlaybackControlService {
  constructor(
    private readonly music: MusicService,
    private readonly settings: GuildSettingsRepository,
    private readonly policy: PlaybackPolicyService,
    readonly votes = new VoteService(),
  ) {}
  private eligible(
    interaction: Pick<RepliableInteraction, 'guild' | 'guildId'>,
  ) {
    const channel = interaction.guildId
      ? this.music.voiceChannel(interaction.guildId)
      : undefined;
    return channel && interaction.guild
      ? [...interaction.guild.voiceStates.cache.values()]
          .filter(
            (s) => s.channelId === channel && s.member?.user.bot === false,
          )
          .map((s) => s.id)
      : [];
  }
  async perform(
    action: PlaybackAction,
    interaction: Pick<
      RepliableInteraction,
      'guildId' | 'guild' | 'user' | 'memberPermissions'
    >,
    expectedGeneration?: number,
    value?: string | number,
  ): Promise<string> {
    if (!interaction.guildId)
      throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
    const id = interaction.guildId;
    const queue = this.music.queue(id);
    if (
      expectedGeneration !== undefined &&
      queue.generation !== expectedGeneration
    )
      throw new CommandError(
        'STALE_PLAYER',
        'The song changed. Refresh the player.',
      );
    const generation = expectedGeneration ?? queue.generation;
    try {
      await this.policy.authorize(
        interaction,
        this.music,
        this.settings,
        action,
        queue.current?.enqueuedBy,
      );
    } catch (error) {
      if (
        action !== 'skip' ||
        !(error instanceof CommandError) ||
        error.code !== 'VOTE_REQUIRED'
      )
        throw error;
      const controls = normalizeGuildControls(
        (await this.settings.get(id)).controls,
      );
      const result = await this.votes.cast({
        guildId: id,
        generation,
        userId: interaction.user.id,
        eligible: this.eligible(interaction),
        threshold: controls.voteThreshold,
        execute: () => this.music.skip(id, generation),
      });
      return result.passed
        ? 'Vote passed. Skipped the song.'
        : `Skip vote: ${result.votes}/${result.required}.`;
    }
    if (action === 'skip') await this.music.skip(id, generation);
    else if (action === 'pause') await this.music.pause(id, generation);
    else if (action === 'resume') await this.music.resume(id, generation);
    else if (action === 'stop') await this.music.stop(id, generation);
    else if (action === 'previous') await this.music.previous(id, generation);
    else if (action === 'shuffle') await this.music.shuffle(id, generation);
    else if (action === 'volume')
      await this.music.setVolume(id, Number(value), generation);
    else if (action === 'filter')
      await this.music.setFilter(
        id,
        value as import('@kairo/music-engine').FilterPreset,
        generation,
      );
    else if (action === 'repeat')
      await this.music.setRepeat(
        id,
        value as import('@kairo/music-engine').RepeatMode,
        generation,
      );
    else if (action === 'disconnect')
      await this.music.disconnect(id, generation);
    else
      throw new CommandError(
        'INVALID_SETTING',
        'Use the corresponding playback setting command.',
      );
    return action === 'skip'
      ? 'Skipped the song.'
      : `${action[0]!.toUpperCase() + action.slice(1)} applied.`;
  }
  async reconcile(
    interaction: Pick<RepliableInteraction, 'guild' | 'guildId'>,
  ) {
    if (!interaction.guildId) return;
    const id = interaction.guildId;
    const controls = normalizeGuildControls(
      (await this.settings.get(id)).controls,
    );
    if (controls.controlPolicy !== 'vote') {
      this.votes.cancel(id);
      return;
    }
    const generation = this.music.queue(id).generation;
    await this.votes.reconcile({
      guildId: id,
      generation,
      userId: '',
      eligible: this.eligible(interaction),
      threshold: controls.voteThreshold,
      execute: () => this.music.skip(id, generation),
    });
  }
}
