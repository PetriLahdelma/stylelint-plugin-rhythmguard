'use strict';

/**
 * The audit turns Stylelint warnings back into findings by reading their
 * text (src/audit/scan/stylesheets.js). This test calls every message
 * template of every Stylelint rule with representative arguments and checks
 * that each shape is either read as the finding type it is, with its value,
 * or listed below as deliberately unclassified. A new template, or a changed
 * one, fails here until the audit's patterns or this list say what it is
 * (cq-02).
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { classifyCssWarningText } = require('../../src/audit/scan/stylesheets');
const noOffscaleTransform = require('../../src/rules/no-offscale-transform');
const preferToken = require('../../src/rules/prefer-token');
const useMotionScale = require('../../src/rules/use-motion-scale');
const useScale = require('../../src/rules/use-scale');

const POSITIONS = [null, 'clamp() minimum', 'clamp() maximum', 'min() argument', 'max() argument'];
const NOTES = ['', 'See the spacing guide.'];

/**
 * Root-level and option reports. None names a value, and the audit's fixed
 * rule options never trigger them: it validates its scale, passes no preset,
 * leaves negatives and percentages allowed and reads no decisions in the
 * rules. If one appears anyway it is a finding of type `unclassified`, not
 * an off-scale value of null.
 */
const DELIBERATELY_UNCLASSIFIED = new Set([
  'no-offscale-transform.invalidPreset',
  'no-offscale-transform.rejectedNegative',
  'no-offscale-transform.rejectedPercentage',
  'prefer-token.invalidPreset',
  'use-scale.invalidPreset',
  'use-scale.rejectedNegative',
  'use-scale.rejectedPercentage',
]);

/** [rule, message key, sample text, expected type, expected value] for every template and argument shape. */
function samples() {
  const out = [];
  const add = (rule, key, text, type, value) => out.push({ key: `${rule}.${key}`, text, type, value });

  for (const [name, plugin] of [['use-scale', useScale], ['no-offscale-transform', noOffscaleTransform]]) {
    const { messages } = plugin;
    add(name, 'invalidPreset', messages.invalidPreset('nope', ['rhythmic-4', 'tailwind']), 'unclassified', null);
    for (const position of POSITIONS) {
      for (const note of NOTES) {
        const aside = position ? ' (20px)' : '';
        add(name, 'rejected', messages.rejected('1.25rem', '16px', '24px', note, position, aside, null), 'off-scale', '1.25rem');
        add(name, 'rejected', messages.rejected('13px', '12px', '12px', note, position, '', null), 'off-scale', '13px');
        if (name === 'use-scale') {
          add(name, 'rejected', messages.rejected('3px', '2px', '4px', note, position, '', 'radius'), 'off-scale', '3px');
        }
        add(name, 'rejectedNegative', messages.rejectedNegative('-8px', note, position), 'unclassified', null);
        add(name, 'rejectedPercentage', messages.rejectedPercentage('50%', note, position), 'unclassified', null);
      }
    }
  }

  const tokenMessages = preferToken.messages;
  add('prefer-token', 'invalidPreset', tokenMessages.invalidPreset('nope', ['rhythmic-4']), 'unclassified', null);
  for (const position of POSITIONS) {
    for (const note of NOTES) {
      add('prefer-token', 'rejected', tokenMessages.rejected('12px', 'var(--space-3)', 'tokens/tokens.json', note, [], position), 'token-opportunity', '12px');
      add('prefer-token', 'rejected', tokenMessages.rejected('12px', 'var(--space-3)', null, note, [], position), 'token-opportunity', '12px');
      add('prefer-token', 'rejected', tokenMessages.rejected('24px', null, null, note, ['--space-gutter', '--space-layout'], position), 'token-opportunity', '24px');
      add('prefer-token', 'rejected', tokenMessages.rejected('13px', null, null, note, [], position), 'token-opportunity', '13px');
    }
  }

  const motion = useMotionScale.messages;
  for (const note of NOTES) {
    add('use-motion-scale', 'invalidDuration', motion.invalidDuration('-100ms', note), 'motion-duration', '-100ms');
    add('use-motion-scale', 'rejectedDuration', motion.rejectedDuration('130ms', '100ms', '150ms', note), 'motion-duration', '130ms');
    add('use-motion-scale', 'rejectedEasing', motion.rejectedEasing('cubic-bezier(0.1, 0.2, 0.3, 0.4)', note), 'motion-easing', 'cubic-bezier(0.1, 0.2, 0.3, 0.4)');
  }

  return out;
}

test('every message template of every rule has a sample here', () => {
  const sampled = new Set(samples().map((sample) => sample.key));
  for (const [name, plugin] of [
    ['no-offscale-transform', noOffscaleTransform],
    ['prefer-token', preferToken],
    ['use-motion-scale', useMotionScale],
    ['use-scale', useScale],
  ]) {
    for (const key of Object.keys(plugin.messages)) {
      assert.ok(sampled.has(`${name}.${key}`), `${name}.${key} has no sample in this test: add one`);
    }
  }
});

test('every message shape is parsed into its finding type and value, or deliberately unclassified', () => {
  for (const sample of samples()) {
    const parsed = classifyCssWarningText(sample.text);
    if (DELIBERATELY_UNCLASSIFIED.has(sample.key)) {
      assert.deepEqual(parsed, { type: 'unclassified', value: null }, `${sample.key} is listed as unclassified: ${sample.text}`);
      continue;
    }
    assert.deepEqual(parsed, { type: sample.type, value: sample.value }, `${sample.key}: ${sample.text}`);
  }
});

test('root-level reports outside the templates are unclassified, not off-scale with no value', () => {
  for (const text of [
    'Invalid tokenPattern regex: [ (rhythmguard/prefer-token)',
    'Invalid Rhythmguard config: decisions must be an array. (rhythmguard/use-scale)',
    'Something a future rule says. (rhythmguard/use-scale)',
  ]) {
    assert.deepEqual(classifyCssWarningText(text), { type: 'unclassified', value: null }, text);
  }
});
