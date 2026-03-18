import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

describe('npm package tarball integration', () => {
  it('can generate package tarball and import it', async () => {
    const cwd = process.cwd();
    const tarball = execSync('npm pack --pack-destination . --silent', { cwd })
      .toString().trim();

    const tarballPath = path.join(cwd, tarball);
    expect(fs.existsSync(tarballPath)).toBe(true);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-charge-sim-'));
    execSync(`npm install --no-save "${tarballPath}"`, { cwd: tmpDir, stdio: 'pipe' });

    const imported = await import(pathToFileURL(path.join(tmpDir, 'node_modules', 'ev-charging-simulator', 'dist', 'public.js')).href);
    expect(typeof imported.Charger).toBe('function');
    expect(typeof imported.createChargers).toBe('function');
    expect(typeof imported.loadChargersFromConfig).toBe('function');
  });
});
