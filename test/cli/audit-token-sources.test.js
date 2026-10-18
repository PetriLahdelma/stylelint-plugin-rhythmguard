'use strict';

/**
 * Which token sources the audit reads, and for what: the spacing scale, the
 * token contract and token chains each take what they need from them.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-sources-'));
  fs.mkdirSync(path.join(dir, '.git'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function audit(cwd, ...args) {
  const result = spawnSync(process.execPath, [cliPath, 'audit', 'src', '--format', 'json', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('--token-kind changes the token contract, not the spacing scale (issue #260)', () => {
  const dir = project({
    'src/a.css': '.a { padding: 6px; margin: 4px; }\n',
    'tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 16px; --radius-sm: 3px; --radius-md: 6px; --radius-lg: 10px; --radius-xl: 14px; }\n',
  });

  const report = audit(dir, '--no-config', '--scale', 'auto', '--token-source', 'tokens.css', '--token-kind', 'radius');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 16]);
  assert.equal(report.contracts.scale.source, 'token-sources');
  assert.deepEqual(report.contracts.scale.offScaleValues, { '6px': 1 });
  assert.deepEqual(report.contracts.tokens.definedTokens.map((token) => token.token), ['--radius-lg', '--radius-md', '--radius-sm', '--radius-xl']);
});

test('token chains resolve through token packages and tokens of any kind in token sources (issue #259)', () => {
  const dir = project({
    'node_modules/@radix-ui/themes/package.json': '{"name":"@radix-ui/themes"}',
    'node_modules/@radix-ui/themes/tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n',
    'package.json': '{"name":"fixture","dependencies":{"@radix-ui/themes":"^3.0.0"}}',
    'primitives.css': ':root { --size-8: 8px; }\n',
    'src/a.css': '.btn { --button-padding: var(--space-2); --card-gap: var(--size-8); }\n',
  });

  const chains = audit(dir, '--no-config', '--scale', 'auto', '--token-source', 'primitives.css').contracts.tokens.chains;
  assert.equal(chains.summary.unresolved, 0, JSON.stringify(chains.entries));
  assert.equal(chains.summary['on-scale'], 2, JSON.stringify(chains));
});

test('the audit reads rc token sources with baseDir and file the way the lint does (issue #271)', () => {
  const dir = project({
    'src/a.css': '.a { margin: 6px; }\n',
    'tokens.css': ':root { --space-1: 3px; --space-2: 6px; --space-3: 9px; --space-4: 12px; }\n',
    'ui/tokens.css': ':root { --space-1: 5px; --space-2: 10px; --space-3: 15px; --space-4: 20px; }\n',
  });

  for (const entry of [{ path: 'tokens.css', baseDir: 'ui' }, { file: 'tokens.css', baseDir: 'ui' }]) {
    fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { tokenSources: [entry] } }));
    const report = audit(dir, '--scale', 'auto');
    assert.deepEqual(report.contracts.scale.values, [0, 5, 10, 15, 20], JSON.stringify(entry));
  }
});

test('an rc token source with a bad format is a config error naming the format', () => {
  const dir = project({
    '.rhythmguardrc.json': JSON.stringify({ audit: { tokenSources: [{ path: 'tokens.css', format: 'scss' }] } }),
    'src/a.css': '.a { margin: 6px; }\n',
  });
  const result = spawnSync(process.execPath, [cliPath, 'audit', 'src'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid token source format "scss"/);
});
