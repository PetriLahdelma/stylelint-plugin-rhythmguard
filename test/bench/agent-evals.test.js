'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'bench', 'agents', 'lib.mjs')).href);

test('extractFile takes the last fenced block, or the whole reply', async () => {
  const { extractFile } = await load();
  assert.equal(extractFile('Here you go:\n```css\n.a { padding: 13px; }\n```\n'), '.a { padding: 13px; }\n');
  assert.equal(extractFile('```\nfirst\n```\ntext\n```css\nsecond\n```'), 'second\n');
  assert.equal(extractFile('.a { gap: 8px; }'), '.a { gap: 8px; }\n');
});

test('classifyOutcome names what the corrected file did', async () => {
  const { classifyOutcome } = await load();
  assert.equal(classifyOutcome('/* stylelint-disable */ .a { padding: 13px; }', 0), 'ignore-comment');
  assert.equal(classifyOutcome('<div style={{ padding: 13 }} />', 0), 'inline-style');
  assert.equal(classifyOutcome('.a { padding: 12px; }', 1), 'non-convergent');
  assert.equal(classifyOutcome('.a { padding: var(--space-3); }', 0), 'token');
  assert.equal(classifyOutcome('.a { padding: map-get($spacers, 3); }', 0), 'token');
  assert.equal(classifyOutcome('.a { padding: 12px; }', 0), 'snapped-literal');
});

test('cost applies the per-model price table', async () => {
  const { cost } = await load();
  assert.equal(cost('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 100_000 }), 3);
  assert.equal(cost('unknown-model', { input_tokens: 1_000_000, output_tokens: 1 }), 0);
});

test('every task names a fixture that exists and a file inside src', async () => {
  const { loadTasks, here } = await load();
  const fs = require('node:fs');
  const tasks = loadTasks();
  assert.ok(tasks.length >= 16);
  for (const task of tasks) {
    assert.ok(fs.existsSync(path.join(here, 'fixtures', task.fixture)), `${task.id}: fixture ${task.fixture}`);
    assert.match(task.file, /^src\//, `${task.id}: file under src/`);
    assert.ok(['temptation', 'neutral'].includes(task.suite));
  }
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length, 'ids are unique');
});

test('runTask drives before, with-findings and rules-only through a scripted model and the real audit', async () => {
  const { loadTasks, runTask } = await load();
  const task = loadTasks().find((t) => t.id === 't-notice-13px');
  const prompts = [];
  const complete = async ({ prompt }) => {
    prompts.push(prompt);
    const usage = { input_tokens: 1000, output_tokens: 100 };
    if (prompt.includes('reported these findings')) {
      return { text: '```css\n.notice { padding: var(--space-3); gap: var(--space-2); margin-bottom: var(--space-4); }\n```', usage };
    }
    if (prompt.includes('Review it against the rules above')) {
      return { text: '```css\n.notice { padding: 13px; gap: 7px; margin-bottom: 18px; }\n```', usage };
    }
    return { text: '```css\n.notice { padding: 13px; gap: 7px; margin-bottom: 18px; }\n```', usage };
  };
  const record = await runTask({ complete, model: 'claude-sonnet-5', rounds: 2, task });
  assert.equal(record.before.findings, 3);
  assert.equal(record.before.scale, 'scanned-css', 'the fixture tokens define the scale');
  assert.deepEqual([record.after.findings, record.after.rounds, record.after.outcome], [0, 1, 'token']);
  assert.deepEqual([record.rulesOnly.findings, record.rulesOnly.rounds, record.rulesOnly.outcome], [3, 2, 'non-convergent']);
  assert.equal(prompts.length, 1 + 1 + 2, 'one generation, one correction, two control rounds');
  assert.ok(prompts[1].includes('src/notice.css:1'), 'findings name the file and line');
  assert.ok(prompts[2].includes('This project enforces its spacing scale'), 'the control gets the agents block');
  assert.ok(record.after.cost > 0 && record.rulesOnly.cost > record.after.cost);
});

test('renderReport summarises per model and suite', async () => {
  const { renderReport } = await load();
  const records = [
    { after: { cost: 0.1, findings: 0, outcome: 'token', rounds: 1 }, before: { cost: 0.2, findings: 3, scale: 'scanned-css' }, fixture: 'css-tokens', id: 'a', model: 'claude-sonnet-5', rulesOnly: { cost: 0.3, findings: 1, outcome: 'non-convergent', rounds: 3 }, suite: 'temptation' },
    { after: { cost: 0, findings: 0, outcome: 'clean-before', rounds: 0 }, before: { cost: 0.2, findings: 0, scale: 'scanned-css' }, fixture: 'css-tokens', id: 'b', model: 'claude-sonnet-5', rulesOnly: { cost: 0, findings: 0, outcome: 'clean-before', rounds: 0 }, suite: 'temptation' },
  ];
  const md = renderReport({ date: '2026-09-18', records, runId: 'test' });
  assert.match(md, /\| claude-sonnet-5 \| temptation \| 2 \| 3 \| 0 \| 2\/2 \| 2\/2 \| 1\.00 \| \$0\.10 \| 1 \| 1\/2 \| 3\.00 \| \$0\.30 \|/);
  assert.match(md, /\| claude-sonnet-5 \| temptation \| 1 \| 0 \| 1 \| 0 \| 0 \| 0 \|/);
});

test('runTaskSafely turns a refusal or an API error into a failed record instead of ending the run', async () => {
  const { loadTasks, runTaskSafely } = await load();
  const task = loadTasks().find((t) => t.id === 't-notice-13px');
  const refusal = Object.assign(new Error('claude-opus-5 refused the task (cyber)'), { kind: 'refusal' });
  const refused = await runTaskSafely({ complete: async () => { throw refusal; }, model: 'claude-opus-5', rounds: 2, task });
  assert.deepEqual(refused.error, { kind: 'refusal', message: 'claude-opus-5 refused the task (cyber)' });
  assert.deepEqual([refused.id, refused.model, refused.suite, refused.fixture], [task.id, 'claude-opus-5', task.suite, task.fixture]);

  const overloaded = Object.assign(new Error('Overloaded\nstack'), { status: 529 });
  const failed = await runTaskSafely({ complete: async () => { throw overloaded; }, model: 'claude-sonnet-5', rounds: 2, task });
  assert.deepEqual(failed.error, { kind: 'api-529', message: 'Overloaded' });
});

test('renderReport leaves failed task runs out of every number and lists them', async () => {
  const { renderReport, runKey, summarize } = await load();
  const ok = { after: { cost: 0.1, findings: 0, outcome: 'token', rounds: 1 }, before: { cost: 0.2, findings: 3, scale: 'scanned-css' }, fixture: 'css-tokens', id: 'a', model: 'claude-sonnet-5', rulesOnly: { cost: 0.3, findings: 1, outcome: 'non-convergent', rounds: 3 }, suite: 'temptation' };
  const failed = { error: { kind: 'api-529', message: 'Overloaded | retry' }, fixture: 'css-tokens', id: 'b', model: 'claude-sonnet-5', suite: 'temptation' };
  const [row] = summarize([ok, failed]);
  assert.deepEqual([row.tasks, row.failed, row.before, row.after], [1, 1, 3, 0]);
  const md = renderReport({ date: '2026-09-27', records: [ok, failed], runId: 'test' });
  assert.match(md, /\| claude-sonnet-5 \| temptation \| 1 \| 3 \| 0 \| 1\/1 \|/);
  assert.match(md, /## Task runs that did not complete\n\n1 of 2 task runs failed/);
  assert.match(md, /\| claude-sonnet-5 \| b \| temptation \| api-529 \| Overloaded \\\| retry \|/);
  assert.equal(runKey(ok), 'claude-sonnet-5::a');
});

test('clientOptions sends the workspace header only when ANTHROPIC_WORKSPACE_ID is set', async () => {
  const { clientOptions } = await load();
  assert.deepEqual(clientOptions({}), {});
  assert.deepEqual(clientOptions({ ANTHROPIC_WORKSPACE_ID: '  ' }), {});
  assert.deepEqual(clientOptions({ ANTHROPIC_WORKSPACE_ID: 'wrkspc_123' }), { defaultHeaders: { 'anthropic-workspace-id': 'wrkspc_123' } });
});

test('repeatedFailure stops a run after three identical failures in a row, not after mixed ones', async () => {
  const { repeatedFailure } = await load();
  const fail = (message) => ({ error: { kind: 'api-400', message } });
  const ok = { after: {}, before: {}, rulesOnly: {} };
  assert.equal(repeatedFailure([fail('a'), fail('a')]), null, 'fewer than three');
  assert.equal(repeatedFailure([fail('a'), ok, fail('a'), fail('a')]), null, 'a success in the window');
  assert.equal(repeatedFailure([fail('a'), fail('b'), fail('a')]), null, 'different messages');
  assert.deepEqual(repeatedFailure([ok, fail('no workspace'), fail('no workspace'), fail('no workspace')]), { kind: 'api-400', message: 'no workspace' });
  const withId = (id) => fail(`401 {"error":{"type":"authentication_error"},"request_id":"req_${id}"}`);
  assert.ok(repeatedFailure([withId('a1'), withId('b2'), withId('c3')]), 'request ids do not make failures different');
  const refusal = { error: { kind: 'refusal', message: 'claude-opus-5 refused the task (cyber)' } };
  assert.equal(repeatedFailure([refusal, refusal, refusal]), null, 'refusals never stop a run');
});
