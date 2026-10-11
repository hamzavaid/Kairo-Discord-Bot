import type { RepliableInteraction } from 'discord.js';
import type { GuildSettingsRepository } from '@kairo/data';
import { CommandError } from '../errors.js';
import type { MusicService } from './MusicService.js';
import type { PlaybackPolicyService } from './PlaybackPolicyService.js';
type Actor = Pick<
  RepliableInteraction,
  'guildId' | 'guild' | 'user' | 'memberPermissions'
>;
export class QueueControlService {
  constructor(
    private readonly music: MusicService,
    private readonly settings: GuildSettingsRepository,
    private readonly policy: PlaybackPolicyService,
  ) {}
  private selected(interaction: Actor, position: number) {
    if (!interaction.guildId)
      throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
    const snapshot = this.music.queue(interaction.guildId);
    const entry = snapshot.upcoming[position - 1];
    if (!Number.isInteger(position) || position < 1 || !entry)
      throw new CommandError(
        'QUEUE_ENTRY_NOT_FOUND',
        'Choose a valid upcoming queue position.',
      );
    return { guildId: interaction.guildId, snapshot, entry };
  }
  async remove(i: Actor, position: number) {
    const { guildId, snapshot, entry } = this.selected(i, position);
    await this.policy.authorize(
      i,
      this.music,
      this.settings,
      'remove',
      entry.enqueuedBy,
    );
    return this.music.removeEntry(guildId, entry.id, snapshot.generation);
  }
  async move(i: Actor, from: number, to: number) {
    const { guildId, snapshot, entry } = this.selected(i, from);
    const target = snapshot.upcoming[to - 1];
    if (!Number.isInteger(to) || to < 1 || !target)
      throw new CommandError(
        'QUEUE_ENTRY_NOT_FOUND',
        'Choose a valid destination position.',
      );
    await this.policy.authorize(
      i,
      this.music,
      this.settings,
      'move',
      entry.enqueuedBy,
    );
    return this.music.moveEntry(
      guildId,
      entry.id,
      target.id,
      snapshot.generation,
    );
  }
  async clear(i: Actor) {
    if (!i.guildId)
      throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
    const generation = this.music.queue(i.guildId).generation;
    await this.policy.authorize(i, this.music, this.settings, 'clear');
    return this.music.clearQueue(i.guildId, generation);
  }
}
