'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function makeFixture(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `rhythmguard-init-${prefix}-`));
}

function readGeneratedConfig(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, '.stylelintrc.json'), 'utf8'));
}

function runInit(cwd, input = 'y\n') {
  return spawnSync(process.execPath, [cliPath, 'init'], {
    cwd,
    encoding: 'utf8',
    input,
  });
}

test('init --help prints the usage and writes nothing; an unknown flag is refused before any prompt (#286)', () => {
  const fixtureDir = makeFixture('help');
  const runWith = (...args) => spawnSync(process.execPath, [cliPath, 'init', ...args], { cwd: fixtureDir, encoding: 'utf8', input: 'y\ny\n' });

  for (const flag of ['--help', '-h']) {
    const help = runWith(flag);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Usage: rhythmguard init \[options\]/);
    assert.match(help.stdout, /--agents/);
  }

  const typo = runWith('--agnets', 'claude');
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /^Unknown option: --agnets\n\nUsage: rhythmguard init/);
  assert.doesNotMatch(typo.stdout, /Overwrite|Write/);

  const empty = runWith('--agents=');
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /^Missing value for --agents\./);

  assert.deepEqual(fs.readdirSync(fixtureDir), [], 'nothing was written');
});

test('init writes recommended config for plain CSS projects', () => {
  const fixtureDir = makeFixture('plain');

  const result = runInit(fixtureDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Detected: plain CSS project/);
  assert.match(result.stdout, /Profile: recommended/);
  assert.deepEqual(readGeneratedConfig(fixtureDir), {
    extends: ['stylelint-plugin-rhythmguard/configs/recommended'],
  });
});

test('init writes tailwind config when Tailwind is installed', () => {
  const fixtureDir = makeFixture('tailwind');
  fs.writeFileSync(
    path.join(fixtureDir, 'package.json'),
    JSON.stringify({ devDependencies: { tailwindcss: '^4.0.0' } }),
  );

  const result = runInit(fixtureDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Detected: Tailwind CSS/);
  assert.match(result.stdout, /Profile: tailwind/);
  assert.deepEqual(readGeneratedConfig(fixtureDir), {
    extends: ['stylelint-plugin-rhythmguard/configs/tailwind'],
  });
});

test('init writes the tailwind config plus Next.js build ignores for Next.js Tailwind projects', () => {
  const fixtureDir = makeFixture('next-tailwind');
  fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({ devDependencies: { tailwindcss: '^4.0.0' } }));
  fs.writeFileSync(path.join(fixtureDir, 'next.config.mjs'), 'export default {};\n');

  const result = runInit(fixtureDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Detected: Tailwind CSS, Next.js/);
  assert.match(result.stdout, /Profile: tailwind/);
  assert.deepEqual(readGeneratedConfig(fixtureDir), {
    extends: ['stylelint-plugin-rhythmguard/configs/tailwind'],
    ignoreFiles: ['.next/**', 'out/**', 'node_modules/**'],
  });
});

test('init aborts without overwriting an existing Stylelint config', () => {
  const fixtureDir = makeFixture('decline-overwrite');
  const configPath = path.join(fixtureDir, '.stylelintrc.json');
  fs.writeFileSync(configPath, '{"extends":["existing"]}\n');

  const result = runInit(fixtureDir, 'n\n');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Existing Stylelint config found/);
  assert.match(result.stdout, /Aborted/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), '{"extends":["existing"]}\n');
});

test('init overwrites an existing Stylelint config after confirmation', () => {
  const fixtureDir = makeFixture('overwrite');
  const configPath = path.join(fixtureDir, '.stylelintrc.json');
  fs.writeFileSync(configPath, '{"extends":["existing"]}\n');

  const result = runInit(fixtureDir, 'yes\nyes\n');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Existing Stylelint config found/);
  assert.match(result.stdout, /Profile: recommended/);
  assert.deepEqual(readGeneratedConfig(fixtureDir), {
    extends: ['stylelint-plugin-rhythmguard/configs/recommended'],
  });
});

test('init does not write a .stylelintrc.json that a package.json "stylelint" key shadows; it prints what to add (#257)', () => {
  const fixtureDir = makeFixture('package-key');
  const pkg = `${JSON.stringify({ name: 'app', stylelint: { rules: { 'color-no-invalid-hex': true } } }, null, 2)}\n`;
  fs.writeFileSync(path.join(fixtureDir, 'package.json'), pkg);

  const result = runInit(fixtureDir, 'y\ny\n');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(fixtureDir, '.stylelintrc.json')), false, 'no shadowed file is written');
  assert.equal(fs.readFileSync(path.join(fixtureDir, 'package.json'), 'utf8'), pkg);
  assert.match(result.stdout, /Stylelint loads the "stylelint" key in package\.json/);
  assert.match(result.stdout, /"stylelint": \{\n\s+"extends": \[\n\s+"stylelint-plugin-rhythmguard\/configs\/recommended"/);
  assert.doesNotMatch(result.stdout, /Wrote/);
});

test('init prints a snippet for a JS config instead of writing a file Stylelint would not load (#257)', () => {
  const fixtureDir = makeFixture('js-config');
  const source = 'export default { rules: {} };\n';
  fs.writeFileSync(path.join(fixtureDir, 'stylelint.config.mjs'), source);

  const result = runInit(fixtureDir, 'y\ny\n');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(fixtureDir, '.stylelintrc.json')), false);
  assert.equal(fs.readFileSync(path.join(fixtureDir, 'stylelint.config.mjs'), 'utf8'), source);
  assert.match(result.stdout, /Stylelint loads stylelint\.config\.mjs/);
  assert.match(result.stdout, /extends: \["stylelint-plugin-rhythmguard\/configs\/recommended"\],/);
});

test('init writes a JSON-shaped .stylelintrc in place, since Stylelint reads it before .stylelintrc.json (#257)', () => {
  const fixtureDir = makeFixture('rc-no-ext');
  fs.writeFileSync(path.join(fixtureDir, '.stylelintrc'), '{"extends":["existing"]}\n');

  const result = runInit(fixtureDir, 'y\ny\n');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Write \.stylelintrc\? \(y\/n\)/);
  assert.equal(fs.existsSync(path.join(fixtureDir, '.stylelintrc.json')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixtureDir, '.stylelintrc'), 'utf8')), {
    extends: ['stylelint-plugin-rhythmguard/configs/recommended'],
  });
});

test('init still writes .stylelintrc.json when it is the config Stylelint loads (#257)', () => {
  const fixtureDir = makeFixture('json-wins');
  fs.writeFileSync(path.join(fixtureDir, '.stylelintrc.json'), '{"extends":["existing"]}\n');
  fs.writeFileSync(path.join(fixtureDir, 'stylelint.config.js'), 'module.exports = {};\n');

  const result = runInit(fixtureDir, 'y\ny\n');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Write \.stylelintrc\.json\? \(y\/n\)/);
  assert.deepEqual(readGeneratedConfig(fixtureDir), {
    extends: ['stylelint-plugin-rhythmguard/configs/recommended'],
  });
});

test('findActiveStylelintConfig follows Stylelint\'s search order (#257)', () => {
  const { findActiveStylelintConfig } = require('../../src/cli/init');
  const fixtureDir = makeFixture('order');
  assert.equal(findActiveStylelintConfig(fixtureDir), null);

  fs.writeFileSync(path.join(fixtureDir, 'stylelint.config.cjs'), 'module.exports = {};\n');
  assert.deepEqual(findActiveStylelintConfig(fixtureDir), { file: 'stylelint.config.cjs', kind: 'code' });
  fs.writeFileSync(path.join(fixtureDir, '.stylelintrc.yml'), 'rules: {}\n');
  assert.deepEqual(findActiveStylelintConfig(fixtureDir), { file: '.stylelintrc.yml', kind: 'yaml' });
  fs.writeFileSync(path.join(fixtureDir, '.stylelintrc.json'), '{}\n');
  assert.deepEqual(findActiveStylelintConfig(fixtureDir), { file: '.stylelintrc.json', kind: 'json' });
  fs.writeFileSync(path.join(fixtureDir, '.stylelintrc'), 'rules: {}\n');
  assert.deepEqual(findActiveStylelintConfig(fixtureDir), { file: '.stylelintrc', kind: 'yaml' });
  fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{"name":"x"}\n');
  assert.deepEqual(findActiveStylelintConfig(fixtureDir), { file: '.stylelintrc', kind: 'yaml' }, 'package.json without the key is skipped');
  fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{"name":"x","stylelint":{}}\n');
  assert.deepEqual(findActiveStylelintConfig(fixtureDir), { file: 'package.json', kind: 'package' });
});
