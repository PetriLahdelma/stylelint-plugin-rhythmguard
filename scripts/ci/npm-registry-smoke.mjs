import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith('--')) {
      continue;
    }

    const key = entry.slice(2);
    const value = argv[i + 1];

    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

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

const argv = parseArgs(process.argv.slice(2));
const pkg = String(argv.package || 'stylelint-plugin-rhythmguard');
const version = argv.version ? String(argv.version) : 'latest';
const spec = `${pkg}@${version}`;
const tempDir = mkdtempSync(path.join(tmpdir(), 'rhythmguard-npm-smoke-'));

try {
  const initResult = run('npm', ['init', '-y'], { cwd: tempDir });
  if (initResult.status !== 0) {
    throw new Error(initResult.stderr || initResult.stdout || 'npm init failed');
  }

  const installResult = run(
    'npm',
    ['install', '--save-dev', 'stylelint@16', spec],
    { cwd: tempDir },
  );
  if (installResult.status !== 0) {
    throw new Error(installResult.stderr || installResult.stdout || 'npm install failed');
  }

  const requireResult = run(
    'node',
    [
      '-e',
      "require('stylelint-plugin-rhythmguard/configs/recommended'); require('stylelint-plugin-rhythmguard/configs/strict');",
    ],
    { cwd: tempDir },
  );
  if (requireResult.status !== 0) {
    throw new Error(requireResult.stderr || requireResult.stdout || 'Config export resolution failed');
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
    throw new Error('Expected off-scale CSS lint failure, but command exited successfully.');
  }

  const lintOutput = `${lintResult.stdout || ''}\n${lintResult.stderr || ''}`;
  if (!lintOutput.includes('rhythmguard/use-scale')) {
    throw new Error('Smoke lint failed, but expected rule id was not found in output.');
  }

  console.log(`npm registry smoke test passed for ${spec}.`);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
