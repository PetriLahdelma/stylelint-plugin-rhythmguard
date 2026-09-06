'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.join(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli', 'index.js');

async function loadBuilder() {
  return import(pathToFileURL(path.join(repoRoot, 'scripts', 'build-agents.mjs')).href);
}

test('the agents block is extracted from FOR_AGENTS.md and every pack contains it', async () => {
  const { buildPacks, extractAgentsBlock } = await loadBuilder();
  const block = extractAgentsBlock(fs.readFileSync(path.join(repoRoot, 'docs', 'FOR_AGENTS.md'), 'utf8'));

  assert.match(block, /^## Spacing scale/);
  assert.match(block, /npx rhythmguard audit \. --format json/);

  const packs = buildPacks(block);
  assert.deepEqual(Object.keys(packs).sort(), ['claude-code/SKILL.md', 'copilot/copilot-instructions.md', 'cursor/rhythmguard.mdc']);
  for (const content of Object.values(packs)) {
    assert.ok(content.includes(block.trim()), 'pack embeds the block verbatim');
    assert.match(content, /docs\/FOR_AGENTS\.md/, 'pack links back to the source');
  }
  assert.match(packs['claude-code/SKILL.md'], /^---\nname: rhythmguard\ndescription: /);
  assert.match(packs['cursor/rhythmguard.mdc'], /^---\n[\s\S]*alwaysApply: true\n---/);
});

test('the committed agents/ files are up to date with FOR_AGENTS.md', async () => {
  const { buildPacks, extractAgentsBlock } = await loadBuilder();
  const block = extractAgentsBlock(fs.readFileSync(path.join(repoRoot, 'docs', 'FOR_AGENTS.md'), 'utf8'));
  for (const [relative, content] of Object.entries(buildPacks(block))) {
    const onDisk = fs.readFileSync(path.join(repoRoot, 'agents', relative), 'utf8');
    assert.equal(onDisk, content, `agents/${relative} is stale; run npm run build:agents`);
  }
});

function runInit(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, 'init', ...args], { cwd, encoding: 'utf8', input: '' });
}

test('init --agents installs the packs into their conventional locations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-agents-'));

  const result = runInit(dir, '--agents', 'all');

  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(path.join(dir, '.claude', 'skills', 'rhythmguard', 'SKILL.md'), 'utf8'), /name: rhythmguard/);
  assert.match(fs.readFileSync(path.join(dir, '.cursor', 'rules', 'rhythmguard.mdc'), 'utf8'), /alwaysApply: true/);
  assert.match(fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8'), /## Spacing scale/);
  assert.match(result.stdout, /\.claude\/skills\/rhythmguard\/SKILL\.md/);
  assert.doesNotMatch(result.stdout, /Write \.stylelintrc\.json/, 'agents mode does not run the config flow');
});

test('init --agents copilot appends to an existing copilot-instructions.md once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-agents-'));
  fs.mkdirSync(path.join(dir, '.github'));
  fs.writeFileSync(path.join(dir, '.github', 'copilot-instructions.md'), '# Team rules\n\nBe kind.\n');

  assert.equal(runInit(dir, '--agents', 'copilot').status, 0);
  assert.equal(runInit(dir, '--agents', 'copilot').status, 0);

  const content = fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(content, /^# Team rules\n\nBe kind\.\n/);
  assert.equal((content.match(/## Spacing scale/g) || []).length, 1, 'block appended exactly once');
});

test('init --agents rejects an unknown target', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-agents-'));
  const result = runInit(dir, '--agents', 'emacs');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /claude|cursor|copilot|all/);
});
