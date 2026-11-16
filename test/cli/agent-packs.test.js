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
  assert.deepEqual(Object.keys(packs).sort(), ['agents-md/rhythmguard.md', 'claude-code/SKILL.md', 'copilot/rhythmguard.instructions.md', 'cursor/rhythmguard.mdc']);
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

test('the committed skill, Claude Code plugin and llms.txt are up to date with FOR_AGENTS.md', async () => {
  const { buildRepoFiles, extractAgentsBlock } = await loadBuilder();
  const block = extractAgentsBlock(fs.readFileSync(path.join(repoRoot, 'docs', 'FOR_AGENTS.md'), 'utf8'));
  const files = buildRepoFiles(block);
  assert.deepEqual(Object.keys(files).sort(), [
    '.claude-plugin/marketplace.json',
    'docs/llms.txt',
    'llms.txt',
    'plugins/rhythmguard/.claude-plugin/plugin.json',
    'plugins/rhythmguard/skills/rhythmguard/SKILL.md',
    'skills/rhythmguard/SKILL.md',
  ]);
  for (const [relative, content] of Object.entries(files)) {
    const onDisk = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    assert.equal(onDisk, content, `${relative} is stale; run npm run build:agents`);
  }
  for (const skill of ['skills/rhythmguard/SKILL.md', 'plugins/rhythmguard/skills/rhythmguard/SKILL.md']) {
    assert.ok(files[skill].includes(block.trim()), `${skill} embeds the block verbatim`);
  }
});

/**
 * The skills CLI (vercel-labs/skills, docs/creating-skills.md) scans skills/
 * and the other containers it lists for <name>/SKILL.md, keeps the first skill
 * of each name, and searches the whole tree only when none is found. The Agent
 * Skills spec (agentskills.io/specification) requires name and description,
 * allows license, compatibility, metadata and allowed-tools, and requires the
 * name to match the folder; its validator rejects any other key.
 */
test('skills/rhythmguard/SKILL.md is where the skills CLI looks, in the Agent Skills format', async () => {
  // .claude/ is gitignored here, so a maintainer's local skills there never reach GitHub.
  const containers = ['skills', '.agents/skills', 'agent/skills'];
  const found = containers.flatMap((container) => {
    const dir = path.join(repoRoot, container);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => fs.existsSync(path.join(dir, name, 'SKILL.md'))).map((name) => `${container}/${name}`);
  });
  assert.deepEqual(found, ['skills/rhythmguard'], 'one skill, in skills/, so the CLI never falls back to a recursive search');

  const content = fs.readFileSync(path.join(repoRoot, 'skills', 'rhythmguard', 'SKILL.md'), 'utf8');
  const fields = frontmatter(content);
  assert.deepEqual(Object.keys(fields).filter((key) => !['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(key)), [], 'only the spec\'s keys');
  assert.equal(fields.name, 'rhythmguard', 'the name matches the folder');
  assert.match(fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(fields.description.length > 0 && fields.description.length <= 1024);
  assert.equal(fields['allowed-tools'], undefined, 'nothing pre-approved where the spec would split the command at its spaces');
});

/**
 * Claude Code plugin marketplaces (code.claude.com/docs/en/plugin-marketplaces
 * and plugins/manifest-reference): .claude-plugin/marketplace.json at the root
 * with name, owner and plugins; each entry's relative source starts with ./,
 * has no .., exists, and has a manifest whose name equals the entry name;
 * skills load from skills/<name>/SKILL.md under the plugin root.
 */
test('.claude-plugin/marketplace.json lists one plugin whose skill is the Claude Code skill', async () => {
  const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.name, 'rhythmguard');
  assert.doesNotMatch(marketplace.name, /^(claude|anthropic|anthropics|cc-plugin)(-|$)|official|^(inline|skills-dir|synced)$/, 'not a reserved name');
  assert.equal(typeof marketplace.owner.name, 'string');
  assert.equal(marketplace.plugins.length, 1);

  const [entry] = marketplace.plugins;
  assert.equal(entry.name, 'rhythmguard');
  assert.match(entry.source, /^\.\//);
  assert.doesNotMatch(entry.source, /\.\./);
  const pluginRoot = path.join(repoRoot, entry.source);
  assert.notEqual(path.resolve(pluginRoot), path.resolve(repoRoot), 'not the repository root, where agents/ would load as plugin subagents');
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, entry.name, 'the manifest name is the entry name');
  assert.equal(manifest.version, undefined, 'no pinned version: installs follow the repository');
  assert.deepEqual(fs.readdirSync(pluginRoot).sort(), ['.claude-plugin', 'skills'], 'a skill and nothing else');

  const { buildPacks, extractAgentsBlock } = await loadBuilder();
  const packs = buildPacks(extractAgentsBlock(fs.readFileSync(path.join(repoRoot, 'docs', 'FOR_AGENTS.md'), 'utf8')));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'rhythmguard', 'SKILL.md'), 'utf8');
  assert.deepEqual(frontmatter(skill), frontmatter(packs['claude-code/SKILL.md']), 'the plugin ships the skill init --agents claude installs');
});

test('llms.txt at the root and on the Pages site lists docs that exist', async () => {
  const { LLMS_SECTIONS, llmsUrl } = await loadBuilder();
  const root = fs.readFileSync(path.join(repoRoot, 'llms.txt'), 'utf8');
  assert.equal(fs.readFileSync(path.join(repoRoot, 'docs', 'llms.txt'), 'utf8'), root, 'Pages serves docs/, so its copy is the same file');
  assert.match(root, /^# Rhythmguard\n\n> /, 'an H1, then a blockquote summary (llmstxt.org)');
  for (const [, entries] of LLMS_SECTIONS) {
    for (const [file] of entries) {
      assert.ok(fs.existsSync(path.join(repoRoot, file)), `${file} is listed in llms.txt and exists`);
      assert.ok(root.includes(`(${llmsUrl(file)})`));
    }
  }
  assert.match(root, /petrilahdelma\.github\.io\/stylelint-plugin-rhythmguard\/SETUP\.md/);
});

test('the npm package ships the packs init copies, not the files that serve installs from GitHub', () => {
  const { files } = require('../../package.json');
  assert.ok(files.includes('agents'));
  for (const entry of ['skills', 'plugins', '.claude-plugin', 'llms.txt']) {
    assert.ok(!files.includes(entry), `${entry} is not in the package`);
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
  assert.equal(claude['allowed-tools'], 'Bash(npx rhythmguard audit . --scale auto --format json)', 'only the exact read-only audit is pre-approved; linters load JS configs, fix and init write, --tailwind-config runs a file');
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
  assert.match(result.stderr, /claude, cursor, copilot, agents, claude-md or all/);
  assert.equal(runInit(dir, '--agents', 'claude,emacs').status, 1, 'one unknown name in a list stops the whole run');
  assert.equal(fs.existsSync(path.join(dir, '.claude')), false, 'nothing was written');
});

function tokenProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-agents-md-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"agents-md-app"}\n');
  fs.writeFileSync(path.join(dir, 'src', 'tokens.css'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-gap: 12px; --space-4: 16px; }\n');
  fs.writeFileSync(path.join(dir, 'src', 'app.css'), '.a { padding: 13px; }\n');
  return dir;
}

test('init --agents agents merges a block with the project scale into AGENTS.md and keeps the rest byte for byte', () => {
  const dir = tokenProject();
  const before = '# Team rules\r\n\r\nBe kind.\r\n';
  const after = '\n## More rules\n\nNo tabs.';
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), before);

  const first = runInit(dir, '--agents', 'agents');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Wrote AGENTS\.md \(Rhythmguard block added; scale hash [0-9a-f]{12}\)/);
  let text = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(text.startsWith(before), 'what was there is kept, line endings included');
  assert.match(text, /<!-- rhythmguard:agents:start -->\n## Spacing scale\n/);
  assert.match(text, /### This project\n\n<!-- rhythmguard:scale-hash [0-9a-f]{12} -->/);
  assert.match(text, /- Audit command: `npx rhythmguard audit \. --scale auto --token-source \.\/src\/tokens\.css --format json`/);
  assert.match(text, /- Scale: 0px, 4px, 8px, 12px, 16px\n/);
  assert.match(text, /- Source: `token-sources`, the token files \(`src\/tokens\.css`\)\./);
  assert.match(text, /4px `var\(--space-1\)`, 8px `var\(--space-2\)`, 12px `var\(--space-3\)` \(or `var\(--space-gap\)`\), 16px `var\(--space-4\)`/);
  assert.match(text, /Stylelint is not installed/);

  // Text after the block survives a rerun, and an unchanged project gives the same file.
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), `${text}${after}`);
  text = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  const second = runInit(dir, '--agents', 'agents');
  assert.match(second.stdout, /Rhythmguard block updated/);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), text, 'a rerun on an unchanged project changes nothing');
});

test('an rc makes the block name the plain audit command the Claude Code skill pre-approves', () => {
  const dir = tokenProject();
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), '{"audit":{"scale":"auto","tokenSources":["./src/tokens.css"]}}\n');
  assert.equal(runInit(dir, '--agents', 'claude-md').status, 0);
  const text = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(text.startsWith('<!-- rhythmguard:agents:start -->\n'), 'a new CLAUDE.md holds the block alone');
  assert.match(text, /Written by `npx rhythmguard init --agents claude-md`/);
  assert.match(text, /- Audit command: `npx rhythmguard audit \. --scale auto --format json`\n/);
  assert.doesNotMatch(text, /can write a \.rhythmguardrc\.json/);
});

test('init --agents all writes only the files Rhythmguard owns; AGENTS.md and CLAUDE.md need their names', () => {
  const dir = tokenProject();
  assert.equal(runInit(dir, '--agents', 'all').status, 0);
  assert.equal(runInit(dir, '--agents').status, 0, 'a bare --agents is all');
  assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false);

  const both = runInit(dir, '--agents', 'all,agents');
  assert.equal(both.status, 0, both.stderr);
  assert.match(both.stdout, /\.claude\/skills\/rhythmguard\/SKILL\.md[\s\S]*AGENTS\.md \(Rhythmguard block created/);
});

test('a Tailwind v3 config is named in the block\'s command and never loaded', () => {
  const dir = tokenProject();
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"tw3","devDependencies":{"tailwindcss":"^3.4.0"}}\n');
  const marker = path.join(dir, 'loaded');
  fs.writeFileSync(path.join(dir, 'tailwind.config.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); module.exports = { theme: { spacing: { 1: '4px' } } };\n`);
  assert.equal(runInit(dir, '--agents', 'agents').status, 0);
  assert.equal(fs.existsSync(marker), false, 'init ran no project code (SECURITY.md)');
  const text = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(text, /--tailwind-config \.\/tailwind\.config\.js --format json/);
  assert.match(text, /computed without loading `\.\/tailwind\.config\.js`/);

  const doctor = spawnSync(process.execPath, [cliPath, 'doctor'], { cwd: dir, encoding: 'utf8' });
  assert.match(doctor.stdout, /AGENTS\.md Rhythmguard block matches the project scale/);
  assert.equal(fs.existsSync(marker), false, 'doctor checks the hash without loading the Tailwind config either');
});

test('doctor warns when the scale in AGENTS.md or CLAUDE.md is stale, and passes once it is refreshed', async () => {
  const { runDoctor } = require('../../src/cli/doctor');
  const dir = tokenProject();
  assert.equal(runInit(dir, '--agents', 'agents,claude-md').status, 0);

  let result = await runDoctor({ cwd: dir });
  let checks = result.checks.filter((check) => check.id === 'agents-scale');
  assert.deepEqual(checks.map((check) => check.status), ['pass', 'pass']);

  // A new step changes the scale; the block now describes an old one.
  fs.writeFileSync(path.join(dir, 'src', 'tokens.css'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; }\n');
  const cwd = process.cwd();
  result = await runDoctor({ cwd: dir });
  assert.equal(process.cwd(), cwd, 'doctor resolves the scale in the project and restores the working directory');
  checks = result.checks.filter((check) => check.id === 'agents-scale');
  assert.deepEqual(checks.map((check) => check.status), ['warn', 'warn']);
  assert.match(checks[0].message, /^AGENTS\.md Rhythmguard block describes a scale that changed \(hash [0-9a-f]{12}, now [0-9a-f]{12}\)$/);
  assert.equal(checks[0].fix, 'Run npx rhythmguard init --agents agents to refresh it');
  assert.equal(checks[1].fix, 'Run npx rhythmguard init --agents claude-md to refresh it');

  assert.equal(runInit(dir, '--agents', 'agents').status, 0);
  result = await runDoctor({ cwd: dir });
  assert.deepEqual(result.checks.filter((check) => check.id === 'agents-scale').map((check) => check.status), ['pass', 'warn']);
});
