import { AuditLog } from '../AuditLog.js';
import type { CommandDefinition } from '../types.js';

export function createAuditlogCommand(audit: AuditLog): CommandDefinition {
  return {
    name: 'auditlog',
    description: 'Show recent Kairo commands',
    usage: '/auditlog [page]',
    category: 'Developer',
    pageOption: true,
    developerOnly: true,
    async execute(context) {
      const records = audit.list(context.page ?? 1, 10);
      return {
        content: records.length
          ? records
              .map(
                (entry) =>
                  `${entry.timestamp} /${entry.command} user=${entry.userId} guild=${entry.guildId ?? 'DM'} ${entry.success ? 'ok' : `failed:${entry.errorCode ?? 'INTERNAL_ERROR'}`} ${entry.durationMs}ms`,
              )
              .join('\n')
              .slice(0, 1900)
          : 'No command records on this page.',
        ephemeral: true,
      };
    },
  };
}
