'use strict';

/**
 * The warnings channel (tf-02, tf-12, cq-05): a loader that cannot read what
 * the user configured says so on every surface instead of falling back in
 * silence. One fixture per failure; each surface is checked for the warning.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const cliPath = path.join(root, 'src', 'cli', 'index.js');
const pluginPath = path.join(root, 'src', 'index.js');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-warnings-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function cli(dir, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd: dir, encoding: 'utf8' });
}

async function lint(dir, code, rules) {
  const { default: stylelint } = await import('stylelint');
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const result = await stylelint.lint({ code, codeFilename: path.join(dir, 'a.css'), config: { plugins: [pluginPath], rules } });
    return result.results[0].warnings.map((warning) => warning.text);
  } finally {
    process.chdir(cwd);
  }
}

// A semantic file whose every token aliases a primitives file that is not configured.
const ALIASES = JSON.stringify({ space: { sm: { $type: 'dimension', $value: '{base.4}' }, md: { $type: 'dimension', $value: '{base.8}' }, lg: { $type: 'dimension', $value: '{base.16}' } } });
const NO_LENGTH = /tokens\.json \(dtcg\): 3 spacing tokens found, none carries a length: --space-sm: \{base\.4\} \(an alias to a token outside this file\)/;

test('a token source with tokens but no lengths warns on the audit, the quickstart, the lint and doctor (tf-02, tf-12)', async () => {
  const dir = project({ 'package.json': '{"name":"x"}', 'tokens.json': ALIASES, 'src/a.css': '.a { padding: 13px; }\n' });

  const json = JSON.parse(cli(dir, 'audit', '.', '--scale', 'auto', '--token-source', 'tokens.json', '--format', 'json').stdout);
  assert.ok(json.warnings.some((warning) => NO_LENGTH.test(warning)), JSON.stringify(json.warnings));
  assert.equal(json.contracts.scale.source, 'fallback');
  assert.equal(json.contracts.scale.rejected.source, 'token-sources');
  assert.ok(json.contracts.scale.rejected.reasons.some((reason) => NO_LENGTH.test(reason)));

  const text = cli(dir, 'audit', '.', '--scale', 'auto', '--token-source', 'tokens.json').stdout;
  assert.match(text, /token sources gave no scale; see the warnings/);
  assert.match(text, NO_LENGTH);

  const quick = cli(dir).stdout;
  assert.match(quick, NO_LENGTH, 'the quickstart prints the warning under Source');
  // The pasted config points at the file, so every lint names why it was not read.
  assert.match(quick, /"scaleSources": \[\s*"\.\/tokens\.json"\s*\]/);

  const messages = await lint(dir, '.a { padding: 13px; }', { 'rhythmguard/use-scale': [true, { scale: 'auto', scaleSources: ['./tokens.json'] }] });
  assert.match(messages[0], NO_LENGTH);
});

test('a malformed .rhythmguardrc.json is named on the first use-scale message, not lost (cq-05)', async () => {
  const dir = project({ '.rhythmguardrc.json': '{ "decisions": [ { "value": "13px", "decision": "adopt" } ' });
  const messages = await lint(dir, '.a { padding: 13px; margin: 13px; }', { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 12, 16] }] });
  assert.equal(messages.length, 2);
  assert.match(messages[0], /\.rhythmguardrc\.json could not be read, so its decisions are not applied/);
  assert.doesNotMatch(messages[1], /rhythmguardrc/, 'once per file');
});

test('a Tailwind config that throws is named on the first prefer-token message, not read as "no token" (cq-05)', async () => {
  const dir = project({ 'tailwind.config.js': "throw new Error('broken config');\n" });
  const messages = await lint(dir, '.a { padding: 16px; }', {
    'rhythmguard/prefer-token': [true, { tailwindConfigPath: './tailwind.config.js', tokenMapFromTailwindSpacing: true }],
  });
  assert.match(messages[0], /Tailwind config \.\/tailwind\.config\.js could not be loaded: broken config/);

  const missing = await lint(dir, '.a { padding: 16px; }', {
    'rhythmguard/prefer-token': [true, { tokenMapFile: './missing.json' }],
  });
  assert.match(missing[0], /Token map file not found: \.\/missing\.json/);
});

test('an invalid tokenPattern on a token source warns instead of reading by name in silence (cq-05)', () => {
  const dir = project({
    '.rhythmguardrc.json': JSON.stringify({ audit: { tokenSources: [{ path: './tokens.css', tokenPattern: '^--space-(' }] } }),
    'tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; }\n',
    'a.css': '.a { padding: 13px; }\n',
  });
  const json = JSON.parse(cli(dir, 'audit', '.', '--scale', 'auto', '--format', 'json').stdout);
  assert.ok(json.warnings.some((warning) => /tokenPattern "\^--space-\(" is not a valid regular expression/.test(warning)), JSON.stringify(json.warnings));
});

test('no catch in src drops an error without a comment, and the commented ones are counted', () => {
  // The lint rule (scripts/eslint/no-silent-catch.js) fails on an uncommented one;
  // this ratchet makes adding a commented one a visible change. Lower it when one goes.
  const ALLOWED = 49;
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  const count = files.reduce((sum, file) => sum + (fs.readFileSync(file, 'utf8').match(/\}\s*catch\s*\{/g) || []).length, 0);
  assert.ok(count <= ALLOWED, `${count} bare catches in src; the allowance is ${ALLOWED}`);
});
