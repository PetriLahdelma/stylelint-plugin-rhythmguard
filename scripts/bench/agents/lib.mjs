/**
 * The agent eval harness (issue #135): does a Rhythmguard finding get a
 * coding agent to zero in one round, and what does it cost?
 *
 * A run is a pair of fresh, context-free agents in an isolated copy of a
 * fixture project. Before: the agent writes the file with no linter. After: a
 * new agent starts from that output and receives the task plus the audit's
 * findings, for up to `rounds` rounds. Rules only (the control): the same
 * starting output plus the agents block from docs/FOR_AGENTS.md, no findings,
 * with a hidden audit deciding whether another round runs.
 *
 * Everything that touches the API goes through one `complete()` function so
 * the pipeline can run against a scripted model in tests and in `--dry-run`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..', '..');

/** USD per million tokens, input and output. Kept next to the model list so an edition records what it assumed. */
export const PRICES = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
};

export const DEFAULT_MODELS = ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5'];

export function loadTasks(file = path.join(here, 'tasks.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).tasks;
}

export function agentsBlock() {
  const doc = fs.readFileSync(path.join(repoRoot, 'docs', 'FOR_AGENTS.md'), 'utf8');
  const match = doc.match(/```md\n([\s\S]*?)\n```/);
  return match ? match[1] : '';
}

/** A throwaway copy of a fixture project. */
export function copyFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rhythmguard-agent-${name}-`));
  fs.cpSync(path.join(here, 'fixtures', name), dir, { recursive: true });
  return dir;
}

export function fixtureContext(dir) {
  const files = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  return files
    .map((file) => `### ${path.relative(dir, file)}\n\n\`\`\`\n${fs.readFileSync(file, 'utf8').trimEnd()}\n\`\`\``)
    .join('\n\n');
}

/** The complete file from the model's reply: the last fenced block, or the whole reply when there is none. */
export function extractFile(reply) {
  const blocks = [...reply.matchAll(/```[a-zA-Z0-9-]*\n([\s\S]*?)```/g)];
  if (blocks.length === 0) return reply.trim() + '\n';
  return blocks[blocks.length - 1][1].replace(/\s+$/, '') + '\n';
}

export function generationPrompt(task, dir) {
  return [
    `You are working in a small front-end project. Its files:`,
    '',
    fixtureContext(dir),
    '',
    `Task: ${task.prompt}`,
    '',
    `Write the complete contents of \`${task.file}\`. Reply with one fenced code block containing the whole file and nothing after it.`,
  ].join('\n');
}

export function correctionPrompt(task, dir, current, findingsText) {
  return [
    `You are working in a small front-end project. Its files:`,
    '',
    fixtureContext(dir),
    '',
    `Task: ${task.prompt}`,
    '',
    `A previous attempt at \`${task.file}\` is below. The project's spacing linter reported these findings on it:`,
    '',
    findingsText,
    '',
    'Fix every finding while keeping the task satisfied. Reply with one fenced code block containing the whole corrected file and nothing after it.',
    '',
    '```',
    current.trimEnd(),
    '```',
  ].join('\n');
}

export function rulesOnlyPrompt(task, dir, current) {
  return [
    `You are working in a small front-end project. Its files:`,
    '',
    fixtureContext(dir),
    '',
    'The project has these rules for spacing:',
    '',
    agentsBlock(),
    '',
    `Task: ${task.prompt}`,
    '',
    `A previous attempt at \`${task.file}\` is below. Review it against the rules above and correct anything that breaks them. Reply with one fenced code block containing the whole corrected file and nothing after it.`,
    '',
    '```',
    current.trimEnd(),
    '```',
  ].join('\n');
}

/** Run the real audit CLI on a project copy and return the findings that count. */
export function audit(dir) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'src', 'cli', 'index.js'), 'audit', 'src', '--scale', 'auto', '--format', 'json'], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (result.status !== 0 && !result.stdout) {
    throw new Error(`audit failed in ${dir}: ${result.stderr}`);
  }
  const report = JSON.parse(result.stdout);
  const findings = [...report.findings.css.filter((f) => f.type === 'off-scale'), ...report.findings.tailwind];
  return {
    findings,
    scale: report.contracts.scale,
    text: findings.map((f) => `- ${f.file}:${f.line} ${f.message || f.text}`).join('\n') || '(none)',
  };
}

/** What the corrected file did with the drift, judged from its text. */
export function classifyOutcome(fileText, findingsAfter) {
  if (/stylelint-disable|eslint-disable|rhythmguard-disable/.test(fileText)) return 'ignore-comment';
  if (/style=\{\{|<style[\s>]/.test(fileText)) return 'inline-style';
  if (findingsAfter > 0) return 'non-convergent';
  if (/var\(--space|map-get\(\$spacers|\$spacer\b|theme\(spacing/.test(fileText)) return 'token';
  return 'snapped-literal';
}

export function cost(model, usage) {
  const price = PRICES[model] || { input: 0, output: 0 };
  return ((usage.input_tokens || 0) * price.input + (usage.output_tokens || 0) * price.output) / 1e6;
}

/**
 * One task through the three conditions. `complete({ model, prompt })` returns
 * `{ text, usage }`; `log` receives progress lines.
 */
export async function runTask({ complete, log = () => {}, model, rounds = 3, task }) {
  const dir = copyFixture(task.fixture);
  const target = path.join(dir, task.file);
  const record = { fixture: task.fixture, id: task.id, model, suite: task.suite };

  // Before: no linter.
  const first = await complete({ model, prompt: generationPrompt(task, dir) });
  let usageBefore = cost(model, first.usage);
  const before = extractFile(first.text);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, before);
  const auditBefore = audit(dir);
  record.before = { cost: usageBefore, findings: auditBefore.findings.length, scale: auditBefore.scale.source };
  log(`${model} ${task.id}: before ${auditBefore.findings.length} findings (scale ${auditBefore.scale.source})`);

  // After: findings fed back, up to `rounds` rounds.
  record.after = await correctLoop({ complete, dir, findingsFirst: auditBefore, model, rounds, start: before, target, task, withFindings: true });
  log(`${model} ${task.id}: with findings ${record.after.findings} after ${record.after.rounds} round(s), ${record.after.outcome}`);

  // Rules only: the control.
  record.rulesOnly = await correctLoop({ complete, dir, findingsFirst: auditBefore, model, rounds, start: before, target, task, withFindings: false });
  log(`${model} ${task.id}: rules only ${record.rulesOnly.findings} after ${record.rulesOnly.rounds} round(s), ${record.rulesOnly.outcome}`);

  fs.rmSync(dir, { force: true, recursive: true });
  return record;
}

async function correctLoop({ complete, dir, findingsFirst, model, rounds, start, target, task, withFindings }) {
  let current = start;
  let findings = findingsFirst;
  let spent = 0;
  let round = 0;
  fs.writeFileSync(target, current);
  while (findings.findings.length > 0 && round < rounds) {
    round += 1;
    const prompt = withFindings ? correctionPrompt(task, dir, current, findings.text) : rulesOnlyPrompt(task, dir, current);
    const reply = await complete({ model, prompt });
    spent += cost(model, reply.usage);
    current = extractFile(reply.text);
    fs.writeFileSync(target, current);
    findings = audit(dir);
  }
  const outcome = findings.findings.length === 0 && round === 0
    ? 'clean-before'
    : classifyOutcome(current, findings.findings.length);
  return { cost: spent, findings: findings.findings.length, outcome, rounds: round };
}

/** The Claude API completion for the harness. Streaming, adaptive thinking where the model supports it. */
export async function claudeComplete(client) {
  return async ({ model, prompt }) => {
    const params = {
      max_tokens: 16000,
      messages: [{ content: prompt, role: 'user' }],
      model,
      system: 'You are a front-end engineer. You write complete files, follow the conventions of the project you are shown, and reply with code only.',
    };
    if (model !== 'claude-haiku-4-5') {
      params.thinking = { type: 'adaptive' };
    }
    const stream = client.messages.stream(params);
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error(`${model} refused the task`);
    }
    const text = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
    return { text, usage: message.usage };
  };
}

export function summarize(records) {
  const byModel = new Map();
  for (const record of records) {
    if (!byModel.has(record.model)) byModel.set(record.model, { model: record.model, suites: new Map() });
    const entry = byModel.get(record.model);
    if (!entry.suites.has(record.suite)) entry.suites.set(record.suite, []);
    entry.suites.get(record.suite).push(record);
  }
  const rows = [];
  for (const entry of byModel.values()) {
    for (const [suite, recs] of entry.suites) {
      const sum = (fn) => recs.reduce((total, r) => total + fn(r), 0);
      rows.push({
        after: sum((r) => r.after.findings),
        before: sum((r) => r.before.findings),
        costAfter: sum((r) => r.after.cost),
        costRulesOnly: sum((r) => r.rulesOnly.cost),
        greenAfter: recs.filter((r) => r.after.findings === 0).length,
        greenRulesOnly: recs.filter((r) => r.rulesOnly.findings === 0).length,
        model: entry.model,
        oneRound: recs.filter((r) => r.after.findings === 0 && r.after.rounds <= 1).length,
        outcomes: recs.reduce((acc, r) => { acc[r.after.outcome] = (acc[r.after.outcome] || 0) + 1; return acc; }, {}),
        roundsAfter: recs.filter((r) => r.after.rounds > 0).reduce((t, r) => t + r.after.rounds, 0) / Math.max(1, recs.filter((r) => r.after.rounds > 0).length),
        roundsRulesOnly: recs.filter((r) => r.rulesOnly.rounds > 0).reduce((t, r) => t + r.rulesOnly.rounds, 0) / Math.max(1, recs.filter((r) => r.rulesOnly.rounds > 0).length),
        rulesOnly: sum((r) => r.rulesOnly.findings),
        suite,
        tasks: recs.length,
      });
    }
  }
  return rows;
}

export function renderReport({ date, records, runId }) {
  const rows = summarize(records);
  const money = (n) => `$${n.toFixed(2)}`;
  const lines = [
    `# Agent evals, ${date}`,
    '',
    'Does a Rhythmguard finding get a coding agent to zero, and what does it cost? Each task runs as a pair of fresh, context-free agents in an isolated copy of a small project. **Before**: the agent writes the file with no linter. **With findings**: a new agent starts from that output and receives the task plus the audit findings, up to three rounds. **Rules only** is the control: the same starting output plus the agents block from `docs/FOR_AGENTS.md`, no findings, with a hidden audit deciding whether another round runs. Method and how to reproduce: [`docs/AGENT_EVALS.md`](./AGENT_EVALS.md). Run id `' + runId + '`.',
    '',
    '| Model | Suite | Tasks | Before | With findings | Green | One round | Rounds | Cost | Rules only | Green | Rounds | Cost |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const r of rows) {
    lines.push(`| ${r.model} | ${r.suite} | ${r.tasks} | ${r.before} | ${r.after} | ${r.greenAfter}/${r.tasks} | ${r.oneRound}/${r.tasks} | ${r.roundsAfter.toFixed(2)} | ${money(r.costAfter)} | ${r.rulesOnly} | ${r.greenRulesOnly}/${r.tasks} | ${r.roundsRulesOnly.toFixed(2)} | ${money(r.costRulesOnly)} |`);
  }
  lines.push('', '## Where the fix landed (with findings)', '', '| Model | Suite | token | snapped-literal | clean-before | non-convergent | inline-style | ignore-comment |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    const o = r.outcomes;
    lines.push(`| ${r.model} | ${r.suite} | ${o.token || 0} | ${o['snapped-literal'] || 0} | ${o['clean-before'] || 0} | ${o['non-convergent'] || 0} | ${o['inline-style'] || 0} | ${o['ignore-comment'] || 0} |`);
  }
  lines.push('', '## Tasks', '', '| Model | Task | Suite | Before | With findings (rounds) | Outcome | Rules only (rounds) |', '| --- | --- | --- | ---: | ---: | --- | ---: |');
  for (const r of records) {
    lines.push(`| ${r.model} | ${r.id} | ${r.suite} | ${r.before.findings} | ${r.after.findings} (${r.after.rounds}) | ${r.after.outcome} | ${r.rulesOnly.findings} (${r.rulesOnly.rounds}) |`);
  }
  lines.push('', `Prices assumed, USD per million tokens: ${Object.entries(PRICES).map(([m, p]) => `${m} ${p.input}/${p.output}`).join(', ')}.`, '');
  return lines.join('\n');
}
