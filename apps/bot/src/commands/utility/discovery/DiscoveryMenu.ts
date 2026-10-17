import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  DISCOVERY_SECTIONS,
  type DiscoveryResult,
  type DiscoverySection,
} from '../../../services/DiscoveryService.js';
import type { CommandExecutionContext } from '../../types.js';
import { showTrackResults } from '../TrackResultMenu.js';
import { uiText } from '../formatTrack.js';
import { CommandError } from '../../../errors.js';
export class DiscoveryMenu {
  private active = true;
  private busy = false;
  private edits = Promise.resolve();
  private version = 0;
  private section: DiscoverySection;
  private query: string | undefined;
  private data!: DiscoveryResult;
  private readonly prefix: string;
  private readonly abort = new AbortController();
  private readonly deadline = Date.now() + 120000;
  constructor(
    private readonly interaction: ChatInputCommandInteraction,
    private readonly context: CommandExecutionContext,
    section: DiscoverySection = 'recommended',
    query?: string,
  ) {
    this.prefix = `kairo:discover:${interaction.id}`;
    this.section = section;
    this.query = query;
  }
  private async load() {
    if (!this.context.discovery)
      throw new CommandError(
        'DISCOVERY_UNAVAILABLE',
        'Discovery is unavailable.',
      );
    const data = await this.context.discovery.load(this.section, {
      guildId: this.interaction.guildId!,
      userId: this.interaction.user.id,
      ...(this.query ? { query: this.query } : {}),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
    });
    if (!this.active) return;
    this.data = data;
    this.version++;
  }
  private render() {
    const data = this.data;
    const disabled = !this.active || this.busy;
    return {
      flags: MessageFlags.IsComponentsV2 as const,
      allowedMentions: { parse: [] as [] },
      components: [
        new ContainerBuilder()
          .setAccentColor(this.active ? 0x7c5cff : 0x58616e)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Kairo Discover\n### ${uiText(data.title, 80)}\n${
                data.tracks
                  .slice(0, 5)
                  .map(
                    (t, n) =>
                      `${n + 1}. ${uiText(t.title, 90)} - ${uiText(t.artists.map((a) => a.name).join(', '), 40)}`,
                  )
                  .join('\n') || 'No songs to preview yet.'
              }\n${data.notice ? `-# ${uiText(data.notice, 200)}` : ''}\n-# Browse songs for artwork, metadata, play, play next, like and playlist actions. ${this.active ? 'Controls expire after 2 minutes.' : 'Menu expired; run /discover again.'}`,
            ),
          )
          .addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`${this.prefix}:section`)
                .setPlaceholder('Explore your music')
                .setDisabled(disabled)
                .addOptions(
                  ...DISCOVERY_SECTIONS.map((value) => ({
                    label: value[0]!.toUpperCase() + value.slice(1),
                    value,
                    default: value === this.section,
                  })),
                ),
            ),
          )
          .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              ...[
                ['browse', 'Browse songs'],
                ['search', 'Search'],
                ['refresh', 'Refresh'],
                ['close', 'Close'],
              ].map(([action, label]) =>
                new ButtonBuilder()
                  .setCustomId(
                    `${this.prefix}:${action}${action === 'browse' ? `:${this.version}` : ''}`,
                  )
                  .setLabel(label!)
                  .setStyle(
                    action === 'browse'
                      ? ButtonStyle.Primary
                      : ButtonStyle.Secondary,
                  )
                  .setDisabled(
                    disabled || (action === 'browse' && !data.tracks.length),
                  ),
              ),
            ),
          ),
      ],
    };
  }
  private edit() {
    const work = this.edits.then(() =>
      this.interaction.editReply(this.render()),
    );
    this.edits = work.then(
      () => {},
      () => {},
    );
    return work;
  }
  async start() {
    await this.load();
    const message = await this.interaction.editReply(this.render());
    const collector = message.createMessageComponentCollector({
      time: 120000,
      filter: (b) =>
        this.active &&
        b.user.id === this.interaction.user.id &&
        [
          `${this.prefix}:section`,
          `${this.prefix}:browse:${this.version}`,
          `${this.prefix}:search`,
          `${this.prefix}:refresh`,
          `${this.prefix}:close`,
        ].includes(b.customId),
    });
    this.context.trackCollector?.(collector);
    collector.on('collect', (b) => {
      if (!this.active || b.user.id !== this.interaction.user.id) return;
      if (b.customId === `${this.prefix}:close`) {
        this.active = false;
        this.abort.abort();
        collector.stop('closed');
        void b
          .deferUpdate()
          .then(() => this.edit())
          .catch((e) => this.context.reportComponentError?.(e));
        return;
      }
      if (this.busy) {
        void b
          .reply({
            content: 'Discovery is updating. Try again shortly.',
            flags: MessageFlags.Ephemeral,
          })
          .catch((e) => this.context.reportComponentError?.(e));
        return;
      }
      this.busy = true;
      void (async () => {
        if (b.customId === `${this.prefix}:browse:${this.version}`) {
          await b.deferReply({ flags: MessageFlags.Ephemeral });
          await showTrackResults(b, this.context, [...this.data.tracks]);
          return;
        }
        if (b.customId === `${this.prefix}:search`) {
          const id = `${this.prefix}:query:${b.id}`;
          await b.showModal(
            new ModalBuilder()
              .setCustomId(id)
              .setTitle('Search music')
              .addLabelComponents(
                new LabelBuilder()
                  .setLabel('Song or artist')
                  .setTextInputComponent(
                    new TextInputBuilder()
                      .setCustomId('query')
                      .setStyle(TextInputStyle.Short)
                      .setRequired(true)
                      .setMaxLength(500),
                  ),
              ),
          );
          const modal = await b
            .awaitModalSubmit({
              time: Math.max(1, Math.min(60000, this.deadline - Date.now())),
              filter: (m) =>
                m.customId === id && m.user.id === this.interaction.user.id,
            })
            .catch(() => undefined);
          if (!modal) return;
          if (!this.active) {
            await modal.reply({
              content: 'Discovery has expired.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await modal.deferUpdate();
          this.query = modal.fields.getTextInputValue('query').trim();
          this.section = 'search';
          await this.load();
          return;
        }
        if (b.isStringSelectMenu()) {
          const value = b.values[0] as DiscoverySection;
          if (!DISCOVERY_SECTIONS.includes(value)) return;
          this.section = value;
        }
        await b.update(this.render());
        await this.load();
      })()
        .catch(async (error) => {
          this.context.reportComponentError?.(error, b.user.id);
          try {
            const response = {
              content:
                this.context.componentErrorMessage?.(error) ??
                'Discovery could not be loaded.',
              flags: MessageFlags.Ephemeral as const,
            };
            if (b.deferred || b.replied) await b.followUp(response);
            else await b.reply(response);
          } catch (e) {
            this.context.reportComponentError?.(e, b.user.id);
          }
        })
        .finally(() => {
          this.busy = false;
          void this.edit().catch((e) => this.context.reportComponentError?.(e));
        });
    });
    collector.on('end', () => {
      this.active = false;
      this.abort.abort();
      void this.edit().catch((e) => this.context.reportComponentError?.(e));
    });
  }
}
