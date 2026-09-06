'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function load() {
  return import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'bench', 'outreach.mjs')).href);
}

const base = {
  name: 'acme',
  url: 'https://github.com/acme/ds.git',
  sha: 'abc1234',
  paths: ['src'],
  scale: { source: 'scanned-css', values: [0, 4, 8, 12, 16], tokenCount: 5, files: ['tokens.css'] },
  summary: { total: 20, drift: 20, falsePositiveRate: 0 },
  classified: [
    ...Array.from({ length: 12 }, () => ({ category: 'drift', value: '10px', property: 'margin-bottom' })),
    ...Array.from({ length: 8 }, () => ({ category: 'drift', value: '15px', property: 'padding' })),
    { category: 'noise:non-authored', value: '13px', property: 'padding' },
  ],
};

test('draftIssue for a repository with its own tokens quotes the count, values and properties, and offers, never demands', async () => {
  const { draftIssue } = await load();
  const { body, title } = draftIssue(base);

  assert.equal(title, 'Spacing scale audit: 20 literal spacing values off your own token scale');
  assert.match(body, /I maintain \[stylelint-plugin-rhythmguard\]/, 'says who is writing');
  assert.match(body, /at `abc1234` over `src`/);
  assert.match(body, /`10px` ×12, `15px` ×8/);
  assert.match(body, /`margin-bottom` ×12, `padding` ×8/);
  assert.match(body, /Nothing is required/);
  assert.match(body, /If you would rather not be listed/);
  assert.doesNotMatch(body, /13px/, 'noise findings are not quoted');
});

test('draftIssue for a fallback-scale repository asks where the tokens live and does not quote the count as a verdict', async () => {
  const { draftIssue } = await load();
  const { body, title } = draftIssue({ ...base, scale: { source: 'fallback', values: [0, 4, 8], tokenCount: 0, files: [] } });

  assert.match(title, /where do your spacing tokens live/);
  assert.match(body, /could not find a spacing token set/);
  assert.match(body, /I am not going to quote it/);
  assert.doesNotMatch(body, /- Values:/);
});
