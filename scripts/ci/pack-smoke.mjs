import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { smokeCli, smokeEslintPlugin, smokeStylelintPlugin } from './smoke-checks.mjs';

/**
 * Packs the three packages as `npm publish` would and runs the registry smoke's
 * checks on the tarballs, so a broken package fails before the release. Each
 * companion is installed with the plugin tarball next to it: the version it
 * depends on is the one in this checkout, which is not on npm yet.
 */
const repoRoot = process.cwd();
const packDir = mkdtempSync(path.join(tmpdir(), 'rhythmguard-pack-'));
const workDirs = [];

function pack(dir) {
  const result = spawnSync('npm', ['pack', '--json', '--pack-destination', packDir], {
    cwd: path.join(repoRoot, dir),
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `npm pack failed in ${dir}`);
  }
  const filename = JSON.parse(result.stdout || '[]')[0]?.filename;
  if (!filename) {
    throw new Error(`Unable to determine tarball filename from npm pack output in ${dir}.`);
  }
  return path.join(packDir, filename);
}

function workDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'rhythmguard-pack-smoke-'));
  workDirs.push(dir);
  return dir;
}

try {
  const { version } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const plugin = pack('.');
  const cli = pack('packages/rhythmguard');
  const eslintPlugin = pack('packages/eslint-plugin-rhythmguard');

  smokeStylelintPlugin(workDir(), { packages: [plugin] });
  console.log('Pack smoke test passed for stylelint-plugin-rhythmguard.');
  smokeCli(workDir(), { packages: [cli, plugin], version });
  console.log('Pack smoke test passed for rhythmguard.');
  smokeEslintPlugin(workDir(), { packages: [eslintPlugin, plugin] });
  console.log('Pack smoke test passed for eslint-plugin-rhythmguard.');
} finally {
  for (const dir of [packDir, ...workDirs]) {
    rmSync(dir, { force: true, recursive: true });
  }
}
