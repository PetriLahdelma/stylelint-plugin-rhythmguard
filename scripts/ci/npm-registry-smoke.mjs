import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { smokeCli, smokeEslintPlugin, smokeStylelintPlugin } from './smoke-checks.mjs';

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

/**
 * Each published package, installed from the registry: see smoke-checks.mjs.
 */
const SMOKES = {
  'stylelint-plugin-rhythmguard': smokeStylelintPlugin,
  rhythmguard: smokeCli,
  'eslint-plugin-rhythmguard': smokeEslintPlugin,
};

const argv = parseArgs(process.argv.slice(2));

if (argv.package === true) {
  throw new Error('Missing value for --package.');
}

if (argv.version === true) {
  throw new Error('Missing value for --version.');
}

const pkg = String(argv.package || 'stylelint-plugin-rhythmguard');
const version = argv.version ? String(argv.version) : 'latest';
const spec = `${pkg}@${version}`;
const smoke = SMOKES[pkg];

if (!smoke) {
  throw new Error(`No smoke test for ${pkg}. Known packages: ${Object.keys(SMOKES).join(', ')}.`);
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'rhythmguard-npm-smoke-'));

try {
  smoke(tempDir, { packages: [spec], registry: 'https://registry.npmjs.org', version });
  console.log(`npm registry smoke test passed for ${spec}.`);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
