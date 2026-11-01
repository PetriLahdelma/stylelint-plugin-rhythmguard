import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Each published package, installed from the registry into an empty project
 * with only what its README tells a user to install alongside it. Stylelint is
 * an optional peer, so only the Stylelint plugin's project installs it: the CLI
 * must bring it, and the ESLint plugin must work without it.
 */
const SMOKES = {
  'stylelint-plugin-rhythmguard': smokeStylelintPlugin,
  rhythmguard: smokeCli,
  'eslint-plugin-rhythmguard': smokeEslintPlugin,
};

function mustSucceed(result, what) {
  if (result.status !== 0) {
    throw new Error(`${what} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function install(cwd, packages) {
  mustSucceed(run('npm', ['init', '-y'], { cwd }), 'npm init');
  mustSucceed(
    run('npm', ['install', '--save-dev', ...packages, '--registry', 'https://registry.npmjs.org'], { cwd }),
    `npm install ${packages.join(' ')}`,
  );
}

function writeOffScaleSources(cwd) {
  mkdirSync(path.join(cwd, 'src'), { recursive: true });
  writeFileSync(path.join(cwd, 'src', 'card.css'), '.card { margin: 13px; }\n', 'utf8');
  writeFileSync(path.join(cwd, 'src', 'card.jsx'), 'export const Card = () => <div className="p-[13px]" />;\n', 'utf8');
}

function smokeStylelintPlugin(cwd, spec) {
  install(cwd, ['stylelint@16', spec]);

  mustSucceed(
    run(
      'node',
      [
        '-e',
        "require('stylelint-plugin-rhythmguard/configs/recommended'); require('stylelint-plugin-rhythmguard/configs/strict');",
      ],
      { cwd },
    ),
    'Config export resolution',
  );

  writeFileSync(
    path.join(cwd, 'stylelint.config.cjs'),
    "module.exports = { extends: ['stylelint-plugin-rhythmguard/configs/recommended'] };\n",
    'utf8',
  );
  writeFileSync(path.join(cwd, 'test.css'), '.card { margin: 13px; }\n', 'utf8');

  const lintResult = run(
    'node',
    ['./node_modules/stylelint/bin/stylelint.mjs', 'test.css', '--config', 'stylelint.config.cjs'],
    { cwd },
  );

  if (lintResult.status === 0) {
    throw new Error('Expected off-scale CSS lint failure, but command exited successfully.');
  }

  const lintOutput = `${lintResult.stdout || ''}\n${lintResult.stderr || ''}`;
  if (!lintOutput.includes('rhythmguard/use-scale')) {
    throw new Error('Smoke lint failed, but expected rule id was not found in output.');
  }
}

// What `npx rhythmguard` gets: the rhythmguard package and nothing else.
function smokeCli(cwd, spec, version) {
  install(cwd, [spec]);
  writeOffScaleSources(cwd);
  const bin = path.join('node_modules', '.bin', 'rhythmguard');

  const printed = mustSucceed(run(bin, ['--version'], { cwd }), 'rhythmguard --version').stdout.trim();
  if (version !== 'latest' && printed !== version) {
    throw new Error(`rhythmguard --version printed ${printed}, expected ${version}.`);
  }

  const audit = mustSucceed(run(bin, ['audit', 'src', '--format', 'json'], { cwd }), 'rhythmguard audit');
  const { findings } = JSON.parse(audit.stdout);
  if (!findings.css.some((finding) => finding.rule === 'rhythmguard/use-scale' && finding.value === '13px')) {
    throw new Error('rhythmguard audit did not report margin: 13px in src/card.css.');
  }
  if (!findings.tailwind.some((finding) => finding.token === 'p-[13px]')) {
    throw new Error('rhythmguard audit did not report p-[13px] in src/card.jsx.');
  }
}

// An ESLint-only project: the plugin must lint without Stylelint installed.
function smokeEslintPlugin(cwd, spec) {
  install(cwd, ['eslint@10', spec]);
  if (existsSync(path.join(cwd, 'node_modules', 'stylelint'))) {
    throw new Error(`${spec} installed Stylelint; it is an optional peer.`);
  }

  writeOffScaleSources(cwd);
  writeFileSync(
    path.join(cwd, 'eslint.config.mjs'),
    [
      "import rhythmguard from 'eslint-plugin-rhythmguard';",
      '',
      'export default [',
      '  {',
      "    files: ['**/*.jsx'],",
      '    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
      "    plugins: { 'rhythmguard-tailwind': rhythmguard },",
      "    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': 'error' },",
      '  },',
      '];',
      '',
    ].join('\n'),
    'utf8',
  );

  const lintResult = run(path.join('node_modules', '.bin', 'eslint'), ['src/card.jsx'], { cwd });
  const lintOutput = `${lintResult.stdout || ''}\n${lintResult.stderr || ''}`;
  if (lintResult.status !== 1 || !lintOutput.includes('rhythmguard-tailwind/tailwind-class-use-scale')) {
    throw new Error(`Expected eslint to report p-[13px] (exit 1), got exit ${lintResult.status}:\n${lintOutput}`);
  }

  // The plugin's own rhythmguard command is on the path here too. Without
  // Stylelint it cannot audit stylesheets, and must say what to install.
  const audit = run(path.join('node_modules', '.bin', 'rhythmguard'), ['audit', 'src'], { cwd });
  if (audit.status !== 1 || !audit.stderr.includes('npm install --save-dev stylelint')) {
    throw new Error(`Expected rhythmguard audit to ask for Stylelint, got exit ${audit.status}:\n${audit.stderr}`);
  }
}

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
  smoke(tempDir, spec, version);
  console.log(`npm registry smoke test passed for ${spec}.`);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
