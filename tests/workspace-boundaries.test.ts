import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

describe('workspace architecture', () => {
  it('exports only the public music engine entry point', () => {
    const manifest = JSON.parse(
      readFileSync(join(root, 'packages/music-engine/package.json'), 'utf8'),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports)).toEqual(['.']);
    const importAttempt = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', "import('@kairo/music-engine/parser')"],
      { cwd: join(root, 'apps/bot'), encoding: 'utf8' },
    );
    expect(importAttempt.status).not.toBe(0);
    expect(importAttempt.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });

  it('keeps engine internals out of the bot and reverse dependencies out of shared', () => {
    const bot = sourceFiles(join(root, 'apps/bot/src'));
    const shared = sourceFiles(join(root, 'packages/shared/src'));
    for (const path of bot) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/@kairo\/music-engine\//);
    }
    for (const path of shared) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /@kairo\/(bot|music-engine|data|games)/,
      );
    }
  });
});
