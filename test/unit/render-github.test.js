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

test('with a baseline new token debt is a warning and the summary splits it from drift (dx-08)', () => {
  const all = report(3);
  const debt = { column: 3, file: 'src/f1.css', line: 2, rule: 'rhythmguard/prefer-token', text: 'Unexpected raw scale value "12px". Use var(--space-3) (tokens/tokens.json).', type: 'token-opportunity' };
  const drift = { ...all.findings.css[0], type: 'off-scale' };
  const out = lines(renderGithub({ ...all, baseline: { newDriftCount: 1, newFindings: [drift, debt], newFindingsCount: 2, newTokenDebtCount: 1, resolvedFindingsCount: 0 } }));
  assert.match(out[0], /Since baseline: 0 resolved, 2 new \(1 drift, 1 token debt\)\./);
  assert.deepEqual(out.filter((line) => /^::(error|warning)/.test(line)).map((line) => line.split(' ')[0]), ['::error', '::warning']);
});

test('200,000 findings render without overflowing the stack', () => {
  const out = lines(renderGithub(report(200000)));
  assert.equal(out.length, 1 + ANNOTATIONS_PER_TYPE + 1);
});

test('markdown puts finding text from the project in code spans, so it cannot form links or mentions', () => {
  const { renderMarkdown } = require('../../src/audit/render-markdown');
  const hostile = { column: 1, file: 'src/a.jsx', line: 1, rule: 'rhythmguard/tailwind', text: 'Unexpected "p-[13px]" [click](https://example.test) @someone ![x](https://example.test/x.png)' };
  const base = report(0);
  const md = renderMarkdown({
    ...base,
    baseline: { baselineFindings: 0, newFindings: [hostile], newFindingsCount: 1, resolvedFindingsCount: 0 },
    cssFilesScanned: 1,
    directory: 'src',
    findings: { ...base.findings, parseErrors: [{ ...hostile, rule: 'CssSyntaxError' }] },
    motion: { values: {} },
    offScaleProperties: {},
    offScaleValues: {},
    tailwindArbitraryValues: {},
    templateFilesScanned: 1,
    tokenContract: { chains: null, conflictingTokens: [], definedTokens: [], ladders: null, missingTokens: [], rawValueCandidates: [], rawValueMatches: [], sources: [], summary: {}, unusedTokens: [] },
    tokenOpportunities: {},
    topAffectedFiles: [],
    totalWarnings: 1,
  });
  const rows = md.split('\n').filter((line) => line.includes('[click]'));
  assert.equal(rows.length, 2, md);
  for (const row of rows) {
    assert.match(row, /`[^`]*\[click\]\(https:\/\/example\.test\)[^`]*`/, `the link stays inside a code span: ${row}`);
  }
});
