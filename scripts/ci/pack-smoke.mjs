import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

const repoRoot = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), 'rhythmguard-pack-smoke-'));
let tarballPath = null;

try {
  const packResult = run('npm', ['pack', '--json'], { cwd: repoRoot });

  if (packResult.status !== 0) {
    throw new Error(packResult.stderr || packResult.stdout || 'npm pack failed');
  }

  const packPayload = JSON.parse(packResult.stdout || '[]');
  const tarballName = packPayload[0]?.filename;

  if (!tarballName) {
    throw new Error('Unable to determine tarball filename from npm pack output.');
  }

  tarballPath = path.join(repoRoot, tarballName);

  const initResult = run('npm', ['init', '-y'], { cwd: tempDir });
  if (initResult.status !== 0) {
    throw new Error(initResult.stderr || initResult.stdout || 'npm init failed');
  }

  const installResult = run(
    'npm',
    ['install', '--save-dev', 'stylelint@16', tarballPath],
    { cwd: tempDir },
  );
  if (installResult.status !== 0) {
    throw new Error(installResult.stderr || installResult.stdout || 'npm install failed');
  }

  const requireResult = run(
    'node',
    [
      '-e',
      "require('stylelint-plugin-rhythmguard/configs/recommended'); require('stylelint-plugin-rhythmguard/configs/strict'); require('stylelint-plugin-rhythmguard/configs/tailwind');",
    ],
    { cwd: tempDir },
  );
  if (requireResult.status !== 0) {
    throw new Error(
      requireResult.stderr || requireResult.stdout || 'Config export resolution check failed',
    );
  }

  writeFileSync(
    path.join(tempDir, 'stylelint.config.cjs'),
    "module.exports = { extends: ['stylelint-plugin-rhythmguard/configs/recommended'] };\n",
    'utf8',
  );

  writeFileSync(path.join(tempDir, 'test.css'), '.card { margin: 13px; }\n', 'utf8');

  const lintResult = run(
    'node',
    ['./node_modules/stylelint/bin/stylelint.mjs', 'test.css', '--config', 'stylelint.config.cjs'],
    { cwd: tempDir },
  );

  if (lintResult.status === 0) {
    throw new Error('Expected stylelint to fail on off-scale value, but it passed.');
  }

  console.log('Pack smoke test passed.');
} finally {
  if (tarballPath) {
    rmSync(tarballPath, { force: true });
  }
  rmSync(tempDir, { force: true, recursive: true });
}
