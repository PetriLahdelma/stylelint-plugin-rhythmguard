#!/usr/bin/env node
/**
 * npm run bench:agents -- [--models a,b] [--suite temptation|neutral] [--limit N] [--rounds N] [--dry-run] [--resume] [--out docs/agent-evals]
 *
 * Runs the agent eval harness (docs/AGENT_EVALS.md) and writes a dated edition.
 * `--dry-run` runs the whole pipeline against a scripted model that writes the
 * task's literal values, so the harness can be exercised without an API key.
 *
 * Progress is written to `<date>.partial.json` after every task run, so a crash
 * or a stopped run keeps what it paid for. `--resume` reads today's partial file
 * and skips every task run that completed; failed ones are retried.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODELS, claudeComplete, clientOptions, loadTasks, renderReport, repoRoot, repeatedFailure, runKey, runTaskSafely } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const dryRun = args.includes('--dry-run');
const resume = args.includes('--resume');
const models = (flag('--models') || DEFAULT_MODELS.join(',')).split(',').map((m) => m.trim()).filter(Boolean);
const suite = flag('--suite');
const limit = Number(flag('--limit', '0'));
const rounds = Number(flag('--rounds', '3'));
const outDir = path.resolve(repoRoot, flag('--out', 'docs/agent-evals'));

let tasks = loadTasks();
if (suite) tasks = tasks.filter((task) => task.suite === suite);
if (limit > 0) tasks = tasks.slice(0, limit);

/** A scripted model: writes the literal values the prompt asks for, then fixes exactly what the findings name. */
function scriptedComplete() {
  return async ({ prompt }) => {
    const usage = { input_tokens: prompt.length / 4, output_tokens: 120 };
    const fileMatch = prompt.match(/contents of `([^`]+)`/) || prompt.match(/attempt at `([^`]+)`/);
    const file = fileMatch ? fileMatch[1] : 'src/out.css';
    const isTsx = file.endsWith('.tsx');
    const findings = prompt.includes('reported these findings');
    if (findings) {
      // Snap every off-scale literal the findings quote to the nearest step of 4.
      const current = prompt.slice(prompt.lastIndexOf('```\n') + 4).replace(/```\s*$/, '');
      const fixed = current.replace(/(\d+)px/g, (m, n) => `${Math.max(4, Math.round(Number(n) / 4) * 4)}px`);
      return { text: '```\n' + fixed + '```', usage };
    }
    const numbers = [...(prompt.match(/Task: (.*)/) || ['', ''])[1].matchAll(/(\d+)px/g)].map((m) => m[1]);
    const values = numbers.length ? numbers : ['16', '8'];
    const text = isTsx
      ? `\`\`\`tsx\nexport function X() {\n  return <div className="p-[${values[0]}px] gap-[${values[1] || values[0]}px]">x</div>;\n}\n\`\`\``
      : `\`\`\`css\n.x {\n  padding: ${values[0]}px;\n  margin-bottom: ${values[1] || values[0]}px;\n}\n\`\`\``;
    return { text, usage };
  };
}

async function main() {
  let complete;
  if (dryRun) {
    complete = scriptedComplete();
  } else {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    complete = await claudeComplete(new Anthropic(clientOptions()));
  }
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${date}${dryRun ? '-dry-run' : ''}`);
  const partialPath = `${base}.partial.json`;

  let runId = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}${dryRun ? '-dry' : ''}`;
  let records = [];
  if (resume && fs.existsSync(partialPath)) {
    const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
    runId = partial.runId;
    records = partial.records.filter((record) => !record.error);
    process.stderr.write(`resuming run ${runId}: ${records.length} task runs already complete\n`);
  }
  const done = new Set(records.map(runKey));
  const save = () => fs.writeFileSync(partialPath, `${JSON.stringify({ date, records, runId }, null, 2)}\n`);

  let stopped = null;
  outer: for (const model of dryRun ? ['scripted'] : models) {
    for (const task of tasks) {
      if (done.has(runKey({ id: task.id, model }))) continue;
      const record = await runTaskSafely({ complete, log: (line) => process.stderr.write(`${line}\n`), model, rounds, task });
      if (record.error) process.stderr.write(`${model} ${task.id}: FAILED (${record.error.kind}) ${record.error.message}\n`);
      records.push(record);
      save();
      stopped = repeatedFailure(records);
      if (stopped) break outer;
    }
  }
  if (stopped) {
    process.stderr.write(`\nStopped: the last three task runs failed the same way, so the rest would too.\n${stopped.message}\n`);
    if (/workspace/i.test(stopped.message)) {
      process.stderr.write('Set ANTHROPIC_WORKSPACE_ID to the workspace id (wrkspc_...) from the Claude Console, or use a key scoped to a workspace.\n');
    }
    process.stderr.write(`Nothing was written except ${path.relative(repoRoot, partialPath)}; fix the cause and rerun with --resume.\n`);
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(`${base}.json`, `${JSON.stringify({ date, records, runId }, null, 2)}\n`);
  fs.writeFileSync(`${base}.md`, renderReport({ date, records, runId }));
  fs.rmSync(partialPath, { force: true });
  const failed = records.filter((record) => record.error).length;
  process.stdout.write(`wrote ${path.relative(repoRoot, base)}.md (${records.length} task runs${failed ? `, ${failed} failed; rerun with --resume to retry them` : ''}, run ${runId})\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
