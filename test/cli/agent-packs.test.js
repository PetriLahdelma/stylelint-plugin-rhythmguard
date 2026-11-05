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
  assert.match(block, /npx rhythmguard audit \. --scale auto --format json/, 'the agent audits against the project scale (ai-01)');
  assert.match(block, /Never invent a token name/);

  const packs = buildPacks(block);
  assert.deepEqual(Object.keys(packs).sort(), ['claude-code/SKILL.md', 'copilot/rhythmguard.instructions.md', 'cursor/rhythmguard.mdc']);
  for (const content of Object.values(packs)) {
    assert.ok(content.includes(block.trim()), 'pack embeds the block verbatim');
    assert.match(content, /docs\/FOR_AGENTS\.md/, 'pack links back to the source');
  }
  assert.match(packs['claude-code/SKILL.md'], /^---\nname: rhythmguard\ndescription: /);
  assert.match(packs['cursor/rhythmguard.mdc'], /^---\n[\s\S]*alwaysApply: false\n---/);
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
  assert.match(fs.readFileSync(path.join(dir, '.cursor', 'rules', 'rhythmguard.mdc'), 'utf8'), /alwaysApply: false/);
  assert.match(fs.readFileSync(path.join(dir, '.github', 'instructions', 'rhythmguard.instructions.md'), 'utf8'), /^---\napplyTo: [\s\S]*## Spacing scale/);
  assert.equal(fs.existsSync(path.join(dir, '.github', 'copilot-instructions.md')), false, 'the shared Copilot file is left alone');
  assert.match(result.stdout, /\.claude\/skills\/rhythmguard\/SKILL\.md/);
  assert.doesNotMatch(result.stdout, /Write \.stylelintrc\.json/, 'agents mode does not run the config flow');
});

test('init --agents copilot moves an older appended block out of copilot-instructions.md', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-agents-'));
  fs.mkdirSync(path.join(dir, '.github'));
  const shared = path.join(dir, '.github', 'copilot-instructions.md');
  fs.writeFileSync(shared, '# Team rules\n\nBe kind.\n\n<!-- rhythmguard:agents:start -->\n## Spacing scale\n\nold text\n<!-- rhythmguard:agents:end -->\n\n## More team rules\n');

  const result = runInit(dir, '--agents', 'copilot');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(shared, 'utf8'), '# Team rules\n\nBe kind.\n\n## More team rules\n', 'only the marked block is removed');
  assert.match(result.stdout, /copilot-instructions\.md \(the block an older version appended there was removed\)/);
  assert.match(fs.readFileSync(path.join(dir, '.github', 'instructions', 'rhythmguard.instructions.md'), 'utf8'), /## Spacing scale/);

  assert.equal(runInit(dir, '--agents', 'copilot').status, 0, 'a rerun is a no-op for the shared file');
  assert.equal(fs.readFileSync(shared, 'utf8'), '# Team rules\n\nBe kind.\n\n## More team rules\n');
});

// Each tool reads only the frontmatter keys it documents, and two of them read
// the same key differently: Cursor ignores globs under alwaysApply: true (ai-10).
const FRONTMATTER = {
  'claude-code/SKILL.md': ['name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent', 'hooks', 'paths', 'shell'],
  'cursor/rhythmguard.mdc': ['description', 'globs', 'alwaysApply'],
  'copilot/rhythmguard.instructions.md': ['applyTo', 'excludeAgent'],
};

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'the pack starts with frontmatter');
  const fields = {};
  let current = null;
  for (const line of match[1].split('\n')) {
    const list = line.match(/^ {2}- "(.*)"$/);
    if (list && current) {
      fields[current] = [...(Array.isArray(fields[current]) ? fields[current] : []), list[1]];
      continue;
    }
    const pair = line.match(/^([\w-]+):\s?(.*)$/);
    assert.ok(pair, `frontmatter line is key: value or a list item: ${line}`);
    current = pair[1];
    fields[current] = pair[2];
  }
  return fields;
}

test('every pack uses only the frontmatter keys its tool documents, in the form it reads', async () => {
  const { buildPacks, extractAgentsBlock, PACK_GLOBS } = await loadBuilder();
  const packs = buildPacks(extractAgentsBlock(fs.readFileSync(path.join(repoRoot, 'docs', 'FOR_AGENTS.md'), 'utf8')));
  for (const [file, allowed] of Object.entries(FRONTMATTER)) {
    const fields = frontmatter(packs[file]);
    assert.deepEqual(Object.keys(fields).filter((key) => !allowed.includes(key)), [], `${file} uses an undocumented key`);
  }
  const claude = frontmatter(packs['claude-code/SKILL.md']);
  assert.deepEqual(claude.paths, PACK_GLOBS);
  assert.equal(claude['allowed-tools'], 'Bash(npx rhythmguard audit:*)', 'only the read-only audit is pre-approved; linters load JS configs, fix and init write');
  const cursor = frontmatter(packs['cursor/rhythmguard.mdc']);
  assert.equal(cursor.alwaysApply, 'false', 'Cursor ignores globs when alwaysApply is true');
  assert.equal(cursor.globs, PACK_GLOBS.join(', '), 'Cursor reads globs as one comma-separated string, not a YAML array');
  const copilot = frontmatter(packs['copilot/rhythmguard.instructions.md']);
  assert.equal(copilot.applyTo, `"${PACK_GLOBS.join(',')}"`);
});

test('init --agents rejects an unknown target', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-agents-'));
  const result = runInit(dir, '--agents', 'emacs');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /claude|cursor|copilot|all/);
});
