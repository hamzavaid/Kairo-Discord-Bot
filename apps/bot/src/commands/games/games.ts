import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { GAME_KINDS, GameError, type GameKind } from '@kairo/games';
import type { SlashCommand } from '../types.js';
import { gamesBrowser } from './GamesBrowser.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription(
      'Game lobbies, statistics, leaderboards and server settings',
    )
    .addSubcommand((o) => o.setName('menu').setDescription('Browse all games'))
    .addSubcommand((o) =>
      o
        .setName('stats')
        .setDescription('Your persistent game statistics')
        .addStringOption((o) =>
          o
            .setName('game')
            .setDescription('Optional game')
            .addChoices(...GAME_KINDS.map((value) => ({ name: value, value }))),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('leaderboard')
        .setDescription('Server game leaderboard')
        .addStringOption((o) =>
          o
            .setName('game')
            .setDescription('Optional game')
            .addChoices(...GAME_KINDS.map((value) => ({ name: value, value }))),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('settings')
        .setDescription('Show or update server game settings')
        .addStringOption((o) =>
          o
            .setName('game')
            .setDescription('Game to enable/disable')
            .addChoices(...GAME_KINDS.map((value) => ({ name: value, value }))),
        )
        .addBooleanOption((o) =>
          o.setName('enabled').setDescription('Enable selected game'),
        )
        .addIntegerOption((o) =>
          o
            .setName('answer_seconds')
            .setDescription('Answer window')
            .setMinValue(10)
            .setMaxValue(60),
        )
        .addIntegerOption((o) =>
          o
            .setName('preview_seconds')
            .setDescription('Trivia preview length')
            .setMinValue(3)
            .setMaxValue(30),
        )
        .addIntegerOption((o) =>
          o
            .setName('max_rounds')
            .setDescription('Trivia round limit')
            .setMinValue(1)
            .setMaxValue(20),
        ),
    ),
  category: 'Games',
  usage: '/games <menu|stats|leaderboard|settings>',
  async execute(i, c) {
    if (!i.guildId || !c.games)
      throw new GameError('GAME_INVALID', 'Games are available in servers.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const action = i.options.getSubcommand();
    if (action === 'menu') {
      await gamesBrowser(i, c);
      return;
    }
    const repo = c.games.repository;
    if (action === 'settings') {
      const settings = await repo.settings(i.guildId);
      const answer = i.options.getInteger('answer_seconds'),
        preview = i.options.getInteger('preview_seconds'),
        rounds = i.options.getInteger('max_rounds'),
        enabled = i.options.getBoolean('enabled'),
        game = i.options.getString('game') as GameKind | null;
      if (
        answer !== null ||
        preview !== null ||
        rounds !== null ||
        enabled !== null
      ) {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
          throw new GameError(
            'GAME_FORBIDDEN',
            'Manage Server is required to configure games.',
          );
        if (enabled !== null && !game)
          throw new GameError(
            'GAME_INVALID',
            'Select a game to enable or disable.',
          );
        await repo.setSettings(i.guildId, {
          ...(answer !== null ? { answerSeconds: answer } : {}),
          ...(preview !== null ? { previewSeconds: preview } : {}),
          ...(rounds !== null ? { maxRounds: rounds } : {}),
          ...(enabled !== null
            ? {
                enabledGames: enabled
                  ? [...new Set([...settings.enabledGames, game!])]
                  : settings.enabledGames.filter((g) => g !== game),
              }
            : {}),
        });
      }
      const current = await repo.settings(i.guildId);
      await i.editReply({
        content: `Enabled: ${current.enabledGames.join(', ') || 'none'}\nAnswer: ${current.answerSeconds}s | Preview: ${current.previewSeconds}s | Rounds: ${current.maxRounds}`,
      });
      return;
    }
    const rows = await repo.leaderboard(
      i.guildId,
      (i.options.getString('game') ?? undefined) as GameKind | undefined,
      action === 'stats' ? i.user.id : undefined,
    );
    await i.editReply({
      content: rows.length
        ? rows
            .map(
              (r, n) =>
                `${n + 1}. <@${r.userId}> | ${r.gamesPlayed} games | ${r.wins} wins | ${r.roundsWon} rounds won | ${r.points} points\nSong/artist: ${r.correctSongs}/${r.correctArtists} | Correct: ${r.correctAnswers}/${r.attempts} (${r.attempts ? Math.round((r.correctAnswers / r.attempts) * 100) : 0}%) | Best streak: ${r.bestStreak}`,
            )
            .join('\n')
            .slice(0, 1900)
        : 'No completed games yet.',
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
