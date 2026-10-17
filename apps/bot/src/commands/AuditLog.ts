import type { AuditRepository } from '@kairo/data';
import { WriteQueue } from '@kairo/shared';
export interface CommandAudit {
  command: string;
  guildId?: string;
  userId: string;
  timestamp: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
}

/** Bounded process-local audit history; deliberately stores no command arguments. */
export class AuditLog {
  private readonly records: CommandAudit[] = [];

  private readonly writes: WriteQueue;
  constructor(
    private readonly capacity = 500,
    private readonly repository?: AuditRepository,
    private readonly report: (error: unknown) => void = () => {},
  ) {
    this.writes = new WriteQueue(512, 2000, report);
  }
  async drain() {
    await this.writes.drain();
  }
  async persistedList(page = 1, limit = 10): Promise<CommandAudit[]> {
    await this.drain();
    try {
      return this.repository
        ? await this.repository.list(page, limit)
        : this.list(page, limit);
    } catch {
      return this.list(page, limit);
    }
  }

  record(entry: CommandAudit): void {
    this.records.unshift({ ...entry });
    if (this.repository) this.writes.add(() => this.repository!.record(entry));
    if (this.records.length > this.capacity)
      this.records.length = this.capacity;
  }

  list(page = 1, limit = 10): CommandAudit[] {
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 10;
    const size = Math.min(limit, 20);
    return this.records
      .slice((page - 1) * size, page * size)
      .map((entry) => ({ ...entry }));
  }
}
