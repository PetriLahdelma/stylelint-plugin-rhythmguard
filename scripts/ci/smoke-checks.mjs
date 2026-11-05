import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * The install-and-run check for each of the three packages, shared by the
 * registry smoke (npm specs, after publishing) and the pack smoke (local
 * tarballs, before). Each runs in an empty project with only what the
 * package's README tells a user to install alongside it. Stylelint is an
 * optional peer, so only the Stylelint plugin's project installs it: the CLI
 * must bring it, and the ESLint plugin must work without it.
 *
 * `packages` is what to install for the package under test: its spec or
 * tarball, plus the stylelint-plugin-rhythmguard tarball when the companion
 * would otherwise resolve that dependency from the registry.
 */

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

function mustSucceed(result, what) {
  if (result.status !== 0) {
    throw new Error(`${what} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function install(cwd, packages, registry) {
  mustSucceed(run('npm', ['init', '-y'], { cwd }), 'npm init');
  const registryArgs = registry ? ['--registry', registry] : [];
  mustSucceed(
    run('npm', ['install', '--save-dev', ...packages, ...registryArgs], { cwd }),
    `npm install ${packages.map((entry) => path.basename(entry)).join(' ')}`,
  );
}

function writeOffScaleSources(cwd) {
  mkdirSync(path.join(cwd, 'src'), { recursive: true });
  writeFileSync(path.join(cwd, 'src', 'card.css'), '.card { margin: 13px; }\n', 'utf8');
  writeFileSync(path.join(cwd, 'src', 'card.jsx'), 'export const Card = () => <div className="p-[13px]" />;\n', 'utf8');
}

/**
 * The Stylelint installs the plugin's smoke runs, one clean project each: the
 * floor, the last 17, and 18 with the shared config that requires it (an install
 * npm refused while the peer range stopped at 17). Stylelint 18 needs Node 22.22,
 * 24.15 or 26, so on an older Node its row is skipped and says so.
 */
export function stylelintSmokeInstalls(nodeVersion = process.versions.node) {
  const [major, minor] = nodeVersion.split('.').map(Number);
  const nodeRunsStylelint18 = (major === 22 && minor >= 22) || (major === 24 && minor >= 15) || major >= 26;
  return [
    { label: 'stylelint 16.7.0', packages: ['stylelint@16.7.0'] },
    { label: 'stylelint 17', packages: ['stylelint@17'] },
    nodeRunsStylelint18
      ? { label: 'stylelint 18 with stylelint-config-standard 41', packages: ['stylelint@18', 'stylelint-config-standard@41'] }
      : { label: 'stylelint 18', skip: `Node ${nodeVersion} is below what Stylelint 18 requires` },
  ];
}

export function smokeStylelintPlugin(cwd, { packages, registry, stylelint = ['stylelint@17'] }) {
  install(cwd, [...stylelint, ...packages], registry);

  mustSucceed(
    run(
      'node',
      [
        '-e',
        "require('stylelint-plugin-rhythmguard/configs/recommended'); require('stylelint-plugin-rhythmguard/configs/strict'); require('stylelint-plugin-rhythmguard/configs/tailwind');",
      ],
      { cwd },
    ),
    'Config export resolution',
  );

  const configs = stylelint.some((entry) => entry.startsWith('stylelint-config-standard@'))
    ? ['stylelint-config-standard', 'stylelint-plugin-rhythmguard/configs/recommended']
    : ['stylelint-plugin-rhythmguard/configs/recommended'];
  writeFileSync(
    path.join(cwd, 'stylelint.config.cjs'),
    `module.exports = { extends: ${JSON.stringify(configs)} };\n`,
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
export function smokeCli(cwd, { packages, registry, version }) {
  install(cwd, packages, registry);
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
export function smokeEslintPlugin(cwd, { packages, registry }) {
  install(cwd, ['eslint@10', ...packages], registry);
  if (existsSync(path.join(cwd, 'node_modules', 'stylelint'))) {
    throw new Error('eslint-plugin-rhythmguard installed Stylelint; it is an optional peer.');
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
