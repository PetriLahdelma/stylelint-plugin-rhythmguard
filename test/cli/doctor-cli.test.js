'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  linkEslint,
  linkEslintPlugin,
  linkPlugin,
  linkStylelint,
  makeProject,
  runDoctorCli,
  stylelintAtVersion,
} = require('../helpers/doctor-fixtures');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

test('doctor validates rhythmguard config token sources and motion settings', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  fs.writeFileSync(
    path.join(fixtureDir, '.rhythmguardrc.json'),
    JSON.stringify({
      audit: {
        includeMotion: true,
        tokenSources: [
          { path: 'tokens.json', format: 'dtcg' },
        ],
      },
    }),
  );
  fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({ spacing: { 4: { $value: '16px' } } }));

  const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
    cwd: fixtureDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /\.rhythmguardrc\.json audit config valid/);
  assert.match(result.stdout, /token source found/);
  assert.match(result.stdout, /motion audit config valid/);
});

function runDoctorWithRc(rc) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  fs.writeFileSync(path.join(fixtureDir, '.rhythmguardrc.json'), JSON.stringify(rc));
  const doctor = spawnSync(process.execPath, [cliPath, 'doctor'], { cwd: fixtureDir, encoding: 'utf8' });
  const audit = spawnSync(process.execPath, [cliPath, 'audit', '.', '--format', 'json'], { cwd: fixtureDir, encoding: 'utf8' });
  return { audit, doctor };
}

test('doctor accepts a decisions-only rc file, as the audit does (#255)', () => {
  const { audit, doctor } = runDoctorWithRc({ decisions: [{ value: '13px', decision: 'allow' }] });

  assert.equal(audit.status, 0, audit.stderr);
  assert.doesNotMatch(doctor.stdout, /audit config missing/);
  assert.match(doctor.stdout, /✓ \.rhythmguardrc\.json audit config valid/);
  assert.match(doctor.stdout, /✓ \.rhythmguardrc\.json decisions valid \(1 decision\)/);
});

test('doctor fails an rc file the audit rejects, with the audit\'s own messages (#255)', () => {
  const { audit, doctor } = runDoctorWithRc({
    audit: { minCleanliness: 150, scale: [] },
    decisions: [{ value: 'abc', decision: 'maybe' }],
  });

  assert.equal(audit.status, 1);
  assert.match(audit.stderr, /minCleanliness must be a number between 0 and 100/);
  assert.equal(doctor.status, 1);
  assert.doesNotMatch(doctor.stdout, /All checks passed/);
  assert.match(doctor.stdout, /✗ \.rhythmguardrc\.json audit config invalid: minCleanliness must be a number between 0 and 100/);
  assert.match(doctor.stdout, /✗ \.rhythmguardrc\.json decisions invalid: Invalid Rhythmguard config: decisions\[0\]/);
});

test('doctor fails a decisions section the audit rejects even when the audit section is valid (#255)', () => {
  const { audit, doctor } = runDoctorWithRc({
    audit: { includeMotion: true },
    decisions: { value: '13px' },
  });

  assert.equal(audit.status, 1);
  assert.match(audit.stderr, /decisions must be an array/);
  assert.match(doctor.stdout, /✓ \.rhythmguardrc\.json audit config valid/);
  assert.match(doctor.stdout, /✗ \.rhythmguardrc\.json decisions invalid: Invalid Rhythmguard config: decisions must be an array\./);
  // One finding, one issue: the audit section is not reported a second time.
  assert.equal((doctor.stdout.match(/decisions must be an array/g) || []).length, 1);
});

test('doctor --help prints the usage instead of running the checks; an unknown flag is refused (#286)', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  const help = spawnSync(process.execPath, [cliPath, 'doctor', '--help'], { cwd: fixtureDir, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Usage: rhythmguard doctor/);
  assert.doesNotMatch(help.stdout, /Rhythmguard Doctor/);

  const unknown = spawnSync(process.execPath, [cliPath, 'doctor', '--fix'], { cwd: fixtureDir, encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /^Unknown option: --fix\n\nUsage: rhythmguard doctor/);
  assert.equal(unknown.stdout, '');
});

test('doctor warns about a token source with no spacing tokens, whatever its format, without failing (issue #163)', () => {
  function doctor(tokenSources) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
    fs.writeFileSync(path.join(fixtureDir, '.rhythmguardrc.json'), JSON.stringify({ audit: { tokenSources } }));
    fs.writeFileSync(path.join(fixtureDir, 'colors.json'), JSON.stringify({ color: { $type: 'color', brand: { $value: { colorSpace: 'srgb', components: [0, 0, 1] } } } }));
    fs.writeFileSync(path.join(fixtureDir, 'theme.css'), 'body { margin: 0; }\n');
    fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({ spacing: { 1: { $value: { value: 4, unit: 'px' } } } }));
    return spawnSync(process.execPath, [cliPath, 'doctor'], { cwd: fixtureDir, encoding: 'utf8' });
  }
  const issuesFound = (stdout) => Number((stdout.match(/^(\d+) issues? found/m) || [])[1]);
  const hint = 'spacing tokens are read by name (space, spacing or spacer, in any case) or, in JSON, by a dimension type, so set a tokenPattern on this source if its tokens are named and typed otherwise';

  const clean = doctor(['tokens.json']);
  assert.doesNotMatch(clean.stdout, /yielded no|warning/);

  const result = doctor([{ path: 'colors.json', format: 'dtcg' }, 'theme.css', 'tokens.json']);
  assert.match(result.stdout, /✓ token source found \(colors\.json\)/);
  assert.ok(result.stdout.includes(`! Token source colors.json (dtcg) yielded no spacing tokens; ${hint}.\n`), result.stdout);
  assert.ok(result.stdout.includes(`! Token source theme.css (css) yielded no spacing tokens; ${hint}.\n`), result.stdout);
  assert.doesNotMatch(result.stdout, /tokens\.json \(dtcg\) yielded/);
  // Warnings, not failures: the issue count is the one a clean token setup gets.
  assert.equal(issuesFound(result.stdout), issuesFound(clean.stdout));
  assert.equal(result.status, clean.status);
  assert.match(result.stdout, /issues? found \(2 warnings\)\./);
});

// An ESLint-only Tailwind app: eslint and eslint-plugin-rhythmguard installed,
// no Stylelint, and the globals.css every Tailwind v4 app has (ai-02).
function eslintOnlyProject({ eslint = true, eslintPlugin = true } = {}) {
  const dir = makeProject({
    '.rhythmguardrc.json': JSON.stringify({ audit: { scale: [0, 4, 8, 12, 16] } }),
    'eslint.config.mjs': "import rhythmguard from 'eslint-plugin-rhythmguard';\nexport default [rhythmguard.configs.recommended];\n",
    'src/app/globals.css': '@import "tailwindcss";\n.card { margin: 13px; }\n',
    'src/button.js': 'export const button = cn("p-[13px] m-2");\n',
  });
  if (eslint) linkEslint(dir);
  if (eslintPlugin) linkEslintPlugin(dir);
  return dir;
}

test('doctor passes an ESLint-only setup without asking for Stylelint, and lints one file with ESLint (ai-02)', () => {
  const result = runDoctorCli(eslintOnlyProject());

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /✓ eslint installed \(v\d+\.\d+\.\d+\)/);
  assert.match(result.stdout, /✓ ESLint config loads \(eslint\.config\.mjs\) and enables rhythmguard-tailwind\/tailwind-class-use-scale/);
  assert.match(result.stdout, /✓ ESLint linted src\/button\.js with this config \(1 tailwind-class-use-scale finding\)/);
  assert.match(result.stdout, /✓ class-string scale 0, 2, 4, 6, .*, from Tailwind default spacing\n/);
  assert.match(result.stdout, /- Stylelint checks skipped \(ESLint-only setup/);
  assert.doesNotMatch(result.stdout, /stylelint not installed/);
});

test('doctor exits 1 on the ESLint-only abort case: the ESLint config cannot load the plugin (ai-02)', () => {
  const result = runDoctorCli(eslintOnlyProject({ eslintPlugin: false }));

  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /✗ ESLint config does not load \(eslint\.config\.mjs\): Cannot find package 'eslint-plugin-rhythmguard'/);
  assert.match(result.stdout, /→ Run: npm install --save-dev eslint eslint-plugin-rhythmguard\n/);
  assert.match(result.stdout, /- Stylelint checks skipped \(ESLint-only setup/);
  assert.match(result.stdout, /1 issue found\./);
});

test('doctor fails an ESLint-only setup when ESLint itself is missing', () => {
  const result = runDoctorCli(eslintOnlyProject({ eslint: false, eslintPlugin: false }));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /✗ eslint not installed/);
  assert.match(result.stdout, /npm install --save-dev eslint eslint-plugin-rhythmguard/);
});

test('doctor exits 1 with Stylelint 18 installed, the init config present and the plugin absent, naming the plugin and its install command (dx-07)', () => {
  const dir = makeProject({
    '.stylelintrc.json': JSON.stringify({ extends: ['stylelint-plugin-rhythmguard/configs/recommended'] }),
    'src/app.css': '.card { margin: 13px; }\n',
  });
  stylelintAtVersion(dir, '18.0.0');
  const result = runDoctorCli(dir);
  const install = 'npm install --save-dev "stylelint@^16.7.0 || ^17.0.0 || ^18.0.0" stylelint-plugin-rhythmguard';

  assert.equal(result.status, 1, result.stdout);
  assert.doesNotMatch(result.stdout, /All checks passed/);
  assert.match(result.stdout, /✓ stylelint installed \(v18\.0\.0\)/);
  assert.match(result.stdout, /✓ stylelint 18\.0\.0 is in the plugin's peer range \(\^16\.7\.0 \|\| \^17\.0\.0 \|\| \^18\.0\.0\)/);
  assert.match(result.stdout, /✗ stylelint-plugin-rhythmguard not installed\n/);
  assert.match(result.stdout, /✗ Stylelint config does not load: Could not find "stylelint-plugin-rhythmguard\/configs\/recommended"/);
  assert.ok(result.stdout.includes(`  → Run: ${install}\n`), result.stdout);
});

test('doctor fails a Stylelint outside the plugin\'s peer range', () => {
  const dir = makeProject({ '.stylelintrc.json': '{}' });
  stylelintAtVersion(dir, '15.11.0', { loadable: false });
  const result = runDoctorCli(dir);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /✗ stylelint 15\.11\.0 is outside the plugin's peer range \(\^16\.7\.0 \|\| \^17\.0\.0 \|\| \^18\.0\.0\)/);
});

test('doctor loads a correct setup, lints one stylesheet and prints the scale and its source (dx-07)', () => {
  const dir = makeProject({
    '.stylelintrc.json': JSON.stringify({
      plugins: ['stylelint-plugin-rhythmguard'],
      rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', scaleSources: ['tokens/tokens.json'] }] },
    }),
    'src/app.css': '.card { margin: 13px; padding: 8px; }\n',
    'tokens/tokens.json': JSON.stringify({ spacing: { 1: { $value: '4px' }, 2: { $value: '8px' }, 3: { $value: '16px' }, 4: { $value: '24px' } } }),
  });
  linkStylelint(dir);
  linkPlugin(dir);
  const result = runDoctorCli(dir);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /✓ stylelint-plugin-rhythmguard installed \(v\d/);
  assert.match(result.stdout, /✓ Stylelint config loads \(\.stylelintrc\.json\), with every extends and plugin resolved/);
  assert.match(result.stdout, /✓ Stylelint config enables rhythmguard\/use-scale\n/);
  assert.match(result.stdout, /✓ spacing scale 0, 4, 8, 16, 24px, from scale "auto" on rhythmguard\/use-scale, from scaleSources: tokens\/tokens\.json\n/);
  assert.match(result.stdout, /✓ Stylelint linted src\/app\.css with this config \(1 rhythmguard finding\)/);
  assert.match(result.stdout, /- ESLint checks skipped \(no ESLint config\)/);
  assert.match(result.stdout, /All checks passed\./);
});

test('doctor names the default scale of the recommended config, and fails a rule option Stylelint rejects', () => {
  const recommended = makeProject({
    '.stylelintrc.json': JSON.stringify({ extends: ['stylelint-plugin-rhythmguard/configs/recommended'] }),
    'src/app.css': '.card { margin: 12px; }\n',
  });
  linkStylelint(recommended);
  linkPlugin(recommended);
  const ok = runDoctorCli(recommended);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /✓ spacing scale 0, 4, 8, 12, 16, 24, 32, 40, 48, 64px, from the "scale" option of rhythmguard\/use-scale, the default scale/);
  assert.match(ok.stdout, /\(0 rhythmguard findings\)/);

  const invalid = makeProject({
    '.stylelintrc.json': JSON.stringify({ plugins: ['stylelint-plugin-rhythmguard'], rules: { 'rhythmguard/use-scale': [true, { nope: 1 }] } }),
    'src/app.css': '.card { margin: 12px; }\n',
  });
  linkStylelint(invalid);
  linkPlugin(invalid);
  const bad = runDoctorCli(invalid);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /✗ Stylelint rejects rule options: .*nope/);
});

test('doctor warns when the ESLint rule checks a different scale than the stylesheets', () => {
  const dir = makeProject({
    '.stylelintrc.json': JSON.stringify({ plugins: ['stylelint-plugin-rhythmguard'], rules: { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 16] }] } }),
    'eslint.config.mjs': "import rhythmguard from 'eslint-plugin-rhythmguard';\nexport default [rhythmguard.configs.recommended];\n",
    'src/app.css': '.card { margin: 8px; }\n',
    'src/button.js': 'export const button = cn("p-[13px] m-2");\n',
  });
  linkStylelint(dir);
  linkPlugin(dir);
  linkEslint(dir);
  linkEslintPlugin(dir);
  const result = runDoctorCli(dir);

  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /✓ spacing scale 0, 4, 8, 16px, from the "scale" option of rhythmguard\/use-scale\n/);
  assert.match(result.stdout, /! class-string scale 0, 2, 4, .*from Tailwind default spacing, which is not the stylesheet scale \(only in ESLint: 2, 6, 10, 12/);
  assert.match(result.stdout, /→ Set "scale": \[0, 4, 8, 16\] on rhythmguard-tailwind\/tailwind-class-use-scale/);
  assert.match(result.stdout, /All checks passed \(1 warning\)\./);
});

test('doctor warns about .scss files with no customSyntax', () => {
  const dir = makeProject({
    '.stylelintrc.json': JSON.stringify({ extends: ['stylelint-plugin-rhythmguard/configs/recommended'] }),
    'src/app.scss': '$gap: 8px;\n.card { margin: $gap; }\n',
  });
  linkStylelint(dir);
  linkPlugin(dir);
  const result = runDoctorCli(dir);

  assert.match(result.stdout, /! 1 \.scss file and no customSyntax for src\/app\.scss/);
  assert.match(result.stdout, /→ Add "customSyntax": "postcss-scss"/);
});
