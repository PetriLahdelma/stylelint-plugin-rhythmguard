'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

test('use-motion-scale reports off-scale transition duration longhands', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: 175ms; }',
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-motion-scale');
  assert.match(result.warnings[0].text, /motion duration/);
});

test('use-motion-scale autofixes off-scale duration values', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: 175ms; animation-delay: 0.175s; }',
    fix: true,
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.code, '.button { transition-duration: 150ms; animation-delay: 0.15s; }');
});

test('use-motion-scale reports shorthand duration drift', async () => {
  const result = await lintCss({
    code: '.button { transition: opacity 175ms cubic-bezier(.2, 0, 0, 1) 75ms; }',
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.some((warning) => /175ms/.test(warning.text)));
  assert.ok(result.warnings.some((warning) => /cubic-bezier/.test(warning.text)));
});

test('use-motion-scale reports negative durations without autofix', async () => {
  const result = await lintCss({
    code: '.button { animation-duration: -75ms; }',
    fix: true,
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.code, '.button { animation-duration: -75ms; }');
});

test('use-motion-scale ignores invalid non-time values', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: fast; animation-delay: var(--duration-fast); }',
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 0);
});

test('use-motion-scale supports custom duration scale', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: 175ms; }',
    rules: {
      'rhythmguard/use-motion-scale': [
        true,
        {
          durationScale: [0, 175, 350],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 0);
});

const MOTION = { 'rhythmguard/use-motion-scale': true };

test('use-motion-scale leaves durations inside calc(), clamp(), min() and max() alone (#232)', async () => {
  const code = [
    '.a { transition-delay: calc(var(--i) * 30ms); }',
    '.b { animation-delay: calc(var(--index) * 50ms + 100ms); }',
    '.c { transition-duration: min(130ms, var(--d)); animation-duration: clamp(120ms, var(--d), 1.3s); }',
    '.d { transition: opacity max(130ms, var(--d)) calc(var(--i) * 30ms); }',
  ].join('\n');
  const result = await lintCss({ code, fix: true, rules: MOTION });

  assert.deepEqual(result.warnings.map((warning) => warning.text), []);
  assert.equal(result.code, code);
});

test('use-motion-scale still checks times next to a calc() (#232)', async () => {
  const result = await lintCss({
    code: '.a { transition: opacity 175ms calc(var(--i) * 30ms); }',
    fix: true,
    rules: MOTION,
  });

  assert.equal(result.code, '.a { transition: opacity 150ms calc(var(--i) * 30ms); }');
});

test('use-motion-scale accepts negative delays (#236)', async () => {
  const result = await lintCss({
    code: [
      '.a { transition-delay: -100ms; animation: spin 1s -0.5s infinite; }',
      '.b { animation-delay: -0.5s; transition: opacity 150ms ease -75ms, transform 200ms -1s; }',
    ].join('\n'),
    rules: MOTION,
  });

  assert.deepEqual(result.warnings.map((warning) => warning.text), []);
});

test('use-motion-scale checks a negative delay against the scale and keeps the sign (#236)', async () => {
  const result = await lintCss({
    code: '.a { transition-delay: -130ms; animation: spin 1s -0.175s; }',
    fix: true,
    rules: MOTION,
  });

  assert.equal(result.code, '.a { transition-delay: -150ms; animation: spin 1s -0.15s; }');
});

test('use-motion-scale still rejects negative durations in longhands and shorthands (#236)', async () => {
  const result = await lintCss({
    code: [
      '.a { transition-duration: -100ms; }',
      '.b { animation: spin -1s 1s; }',
      '.c { transition: opacity 150ms -75ms, transform -200ms; }',
    ].join('\n'),
    rules: MOTION,
  });

  assert.deepEqual(result.warnings.map((warning) => warning.text), [
    'Unexpected negative motion duration "-100ms". Use non-negative duration values. (rhythmguard/use-motion-scale)',
    'Unexpected negative motion duration "-1s". Use non-negative duration values. (rhythmguard/use-motion-scale)',
    'Unexpected negative motion duration "-200ms". Use non-negative duration values. (rhythmguard/use-motion-scale)',
  ]);
});

test('use-motion-scale does not guess which time a var() stands for in a shorthand (#236)', async () => {
  const result = await lintCss({
    code: '.a { transition: opacity var(--motion-duration) -100ms; }',
    rules: MOTION,
  });

  assert.deepEqual(result.warnings.map((warning) => warning.text), []);
});

// Issue #273: a scalar or empty durationScale and durationUnits fell back to the defaults silently.
for (const options of [{ durationScale: 100 }, { durationScale: [] }, { durationUnits: 's' }, { durationUnits: [] }, { durationUnits: ['ms', 'min'] }]) {
  test(`use-motion-scale rejects ${JSON.stringify(options)} (#273)`, async () => {
    const result = await lintCss({ code: '.a { transition: opacity 175ms; }', rules: { 'rhythmguard/use-motion-scale': [true, options] } });
    const [optionName] = Object.keys(options);
    assert.equal(result.errored, true);
    assert.ok(
      result.invalidOptionWarnings.some((warning) => warning.text.includes(`option "${optionName}" of rule "rhythmguard/use-motion-scale"`)),
      result.invalidOptionWarnings.map((warning) => warning.text).join('\n') || 'no invalid option warning',
    );
  });
}

test('use-motion-scale still accepts array durationScale and durationUnits (#273)', async () => {
  const result = await lintCss({
    code: '.a { transition: opacity 175ms; }',
    rules: { 'rhythmguard/use-motion-scale': [true, { durationScale: [0, 175], durationUnits: ['ms'] }] },
  });
  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.deepEqual(result.warnings, []);
});

// Issue #276: the messages the docs print are the messages the rule reports.
test('the use-motion-scale docs show the messages the rule reports (#276)', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'rules', 'use-motion-scale.md'), 'utf8');
  const result = await lintCss({ code: '.button {\n  transition: opacity 175ms cubic-bezier(.2, 0, 0, 1);\n}', rules: MOTION });
  const texts = result.warnings.map((warning) => warning.text);

  assert.equal(texts.length, 2, texts.join('\n'));
  for (const text of texts) {
    assert.ok(doc.includes(text), `docs/rules/use-motion-scale.md does not show: ${text}`);
  }
});
