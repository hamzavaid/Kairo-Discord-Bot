import type { Connection } from 'mongoose';
/** Persistence health boundary returns safe state only; errors/URIs never enter diagnostics. */
export async function databaseHealth(
  connection: Connection,
  timeoutMs = 2000,
): Promise<{ status: 'healthy' | 'unavailable' }> {
  if (connection.readyState !== 1 || !connection.db)
    return { status: 'unavailable' };
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      connection.db.admin().ping({ maxTimeMS: timeoutMs }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Database health timeout.')),
          timeoutMs,
        );
      }),
    ]);
    return { status: 'healthy' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
