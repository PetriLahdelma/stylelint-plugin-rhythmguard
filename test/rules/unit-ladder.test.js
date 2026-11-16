'use strict';

/**
 * Unit ladders: spacing written as multiples of a custom property with no
 * fixed length, as a font-metric system does (`--gap: calc(1rlh - 1rex)`,
 * steps `calc(var(--gap) * 0.5 | 1 | 2 | 3)`). By default the ladder is named
 * and nothing is added (3.x: findings only decrease); `unitLadder: "auto"` on
 * use-scale and `--unit-ladder` on the audit check it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { customPropertiesInText, detectUnitLadder } = require('../../src/core/unit-ladder');
const { lintCss } = require('../helpers/lint');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

const TOKENS = ':root {\n  --gap: calc(1rlh - 1rex);\n  --gap--relative: calc(1lh - 1ex);\n  --space-half: calc(var(--gap) * 0.5);\n  --space-1: var(--gap);\n  --space-2: calc(var(--gap) * 2);\n  --space-3: calc(3 * var(--gap));\n}\n';
const USES = 'p { margin-block-start: calc(var(--gap) * 2); }\n.card { padding: calc(var(--gap) * 1.3); gap: 13px; margin: 8px; inset: calc(var(--gap) / 3); border-width: 1px; }\n';

test('a ladder of multiples of an unfixed unit is detected, with its steps and tokens', () => {
  const ladder = detectUnitLadder(customPropertiesInText(TOKENS, 'tokens.css'));
  assert.deepEqual(ladder, {
    files: ['tokens.css'],
    multipliers: [0.5, 1, 2, 3],
    tokens: { 0.5: '--space-half', 1: '--space-1', 2: '--space-2', 3: '--space-3' },
    unit: '--gap',
    value: 'calc(1rlh - 1rex)',
  });
  // A fixed base (4px) is a px scale, which inference already reads; one multiple is not a ladder.
  assert.equal(detectUnitLadder(customPropertiesInText(':root { --u: 4px; --a: calc(var(--u) * 2); --b: calc(var(--u) * 3); }')), null);
  assert.equal(detectUnitLadder(customPropertiesInText(':root { --gap: calc(1rlh - 1rex); --a: calc(var(--gap) * 2); }')), null);
});

test('by default nothing is added: the ladder is named on the first message of a file that falls back', async () => {
  const result = await lintCss({ code: `${TOKENS}${USES}`, rules: { 'rhythmguard/use-scale': [true, { scale: 'auto' }] } });
  assert.deepEqual(result.warnings.map((warning) => /"([^"]+)"/.exec(warning.text)[1]), ['13px']);
  assert.match(result.warnings[0].text, /Spacing tokens are multiples of --gap \(calc\(1rlh - 1rex\)\), which has no fixed length: 0\.5, 1, 2, 3\. Set unitLadder: "auto"/);
});

test('unitLadder "auto" checks multipliers, reports literal lengths when no px scale exists, and snaps with --fix', async () => {
  const rules = { 'rhythmguard/use-scale': [true, { scale: 'auto', unitLadder: 'auto' }] };
  const result = await lintCss({ code: `${TOKENS}${USES}`, rules });
  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((warning) => warning.text);
  assert.deepEqual(texts, [
    'Unexpected multiplier "1.3" of var(--gap). Use a step of the var(--gap) ladder (nearest: 1 or 2). (rhythmguard/use-scale)',
    'Unexpected length "13px". Spacing here is a multiple of var(--gap); write calc(var(--gap) * N) with N one of 0.5, 1, 2, 3. (rhythmguard/use-scale)',
    'Unexpected length "8px". Spacing here is a multiple of var(--gap); write calc(var(--gap) * N) with N one of 0.5, 1, 2, 3. (rhythmguard/use-scale)',
    'Unexpected multiplier "1/3" of var(--gap). Use a step of the var(--gap) ladder (nearest: 0.5). (rhythmguard/use-scale)',
  ]);
  assert.doesNotMatch(texts.join('\n'), /No spacing tokens were found/, 'the px fallback is not the scale here, so its note is not shown');

  const fixed = await lintCss({ code: `${TOKENS}${USES}`, fix: true, rules });
  assert.match(fixed.code, /padding: calc\(var\(--gap\) \* 1\);/);
  assert.match(fixed.code, /inset: calc\(var\(--gap\) \/ 3\);/, 'a division is reported, not rewritten');
  assert.match(fixed.code, /gap: 13px;/, 'a length has no ladder equivalent to write');
});

test('with a px scale found, unitLadder checks multipliers only; an explicit ladder needs no tokens', async () => {
  const pxTokens = ':root { --gap: calc(1rlh - 1rex); --a: calc(var(--gap) * 2); --b: calc(var(--gap) * 3); --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n';
  const result = await lintCss({ code: `${pxTokens}.a { gap: 8px; padding: calc(var(--gap) * 5); }`, rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', unitLadder: 'auto' }] } });
  assert.deepEqual(result.warnings.map((warning) => /"([^"]+)"/.exec(warning.text)[1]), ['5']);

  const explicit = await lintCss({
    code: '.a { margin: calc(var(--line) * 1.25); padding: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 12, 16], unitLadder: { lengths: false, multipliers: [0.5, 1, 1.5, 2], unit: '--line' } }] },
  });
  assert.deepEqual(explicit.warnings.map((warning) => /"([^"]+)"/.exec(warning.text)[1]), ['1.25', '13px']);
  assert.match(explicit.warnings[0].text, /nearest: 1 or 1\.5/);

  const invalid = await lintCss({ code: '.a {}', rules: { 'rhythmguard/use-scale': [true, { unitLadder: { multipliers: [], unit: 'gap' } }] } });
  assert.equal(invalid.invalidOptionWarnings.length, 1);
});

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-unit-ladder-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'tokens.css'), TOKENS);
  fs.writeFileSync(path.join(dir, 'src', 'a.css'), USES);
  return dir;
}

function cli(dir, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd: dir, encoding: 'utf8' });
}

test('the audit names the ladder by default and checks it with --unit-ladder', () => {
  const dir = project();
  const plain = JSON.parse(cli(dir, 'audit', '.', '--no-config', '--scale', 'auto', '--format', 'json').stdout);
  assert.equal(plain.contracts.scale.source, 'fallback');
  assert.equal(plain.contracts.scale.unitLadder.unit, '--gap');
  assert.equal(plain.contracts.scale.unitLadder.checked, false);
  assert.ok(plain.warnings.some((warning) => /multiples of --gap .*pass --unit-ladder/.test(warning)));
  assert.equal(plain.findings.css.filter((finding) => finding.type === 'off-ladder').length, 0);

  const checked = JSON.parse(cli(dir, 'audit', '.', '--no-config', '--scale', 'auto', '--unit-ladder', '--format', 'json').stdout);
  assert.equal(checked.contracts.scale.unitLadder.checked, true);
  assert.deepEqual(checked.findings.css.filter((finding) => finding.type === 'off-ladder').map((finding) => finding.value), ['1.3', '13px', '8px', '1/3']);
  assert.ok(!checked.warnings.some((warning) => /pass --unit-ladder/.test(warning)));

  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { scale: 'auto', unitLadder: true } }));
  const fromRc = JSON.parse(cli(dir, 'audit', '.', '--format', 'json').stdout);
  assert.equal(fromRc.contracts.scale.unitLadder.checked, true);

  const scale = cli(dir, 'scale', '.').stdout;
  assert.match(scale, /Unit ladder\s+--gap = calc\(1rlh - 1rex\): 0\.5, 1, 2, 3/);
  assert.match(scale, /2 x --gap\s+--space-2/);
});
