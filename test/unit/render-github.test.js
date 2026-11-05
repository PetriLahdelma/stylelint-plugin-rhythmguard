'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { ANNOTATIONS_PER_TYPE, renderGithub } = require('../../src/audit/render-github');

function finding(index) {
  return { column: 3, file: `src/f${index}.css`, line: index + 1, rule: 'rhythmguard/use-scale', text: `Unexpected off-scale value "${13 + (index % 3)}px".` };
}

function report(count, extra = {}) {
  const css = Array.from({ length: count }, (_, index) => finding(index));
  return { filesWithIssues: count, findings: { css, motion: [], parseErrors: [], tailwind: [] }, scaleCleanliness: 50, ...extra };
}

const lines = (output) => output.trim().split('\n');

test('the summary comes first and annotations stop at the cap with a notice', () => {
  const out = lines(renderGithub(report(25)));
  assert.match(out[0], /^::notice title=Rhythmguard audit::25 findings across 25 files, 50%25 scale cleanliness$/);
  assert.equal(out.filter((line) => line.startsWith('::warning')).length, ANNOTATIONS_PER_TYPE);
  assert.match(out.at(-1), /^::notice title=Rhythmguard audit::15 more not annotated: GitHub shows 10 per type/);
});

test('with a baseline only new findings are annotated, as errors', () => {
  const all = report(30);
  const fresh = [all.findings.css[7]];
  const out = lines(renderGithub({ ...all, baseline: { newFindings: fresh, newFindingsCount: 1, resolvedFindingsCount: 4 } }));
  assert.match(out[0], /^::notice title=Rhythmguard audit::Since baseline: 4 resolved, 1 new\. 30 findings across 30 files/);
  assert.deepEqual(out.filter((line) => /^::(error|warning)/.test(line)), ['::error file=src/f7.css,line=8,col=3,title=rhythmguard/use-scale::New since the baseline: Unexpected off-scale value "14px".']);
  assert.equal(out.length, 2, 'no cap notice when nothing was left out');
});

test('200,000 findings render without overflowing the stack', () => {
  const out = lines(renderGithub(report(200000)));
  assert.equal(out.length, 1 + ANNOTATIONS_PER_TYPE + 1);
});
