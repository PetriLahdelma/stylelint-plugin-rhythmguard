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
