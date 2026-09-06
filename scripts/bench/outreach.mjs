#!/usr/bin/env node
/**
 * Drafts one audit issue per benchmark repository from the quiet benchmark
 * results (strategy B4 and 9.1). Writes docs/outreach/audits/<repo>.md and a
 * posting manifest at benchmarks/quiet/outreach.json; posting is a separate,
 * paced step so every draft can be read before anything leaves this machine.
 *
 *   npm run bench:outreach                # draft all
 *   npm run bench:outreach -- --only x,y  # draft some
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessScale, topCounts } from './state-of-spacing.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const resultsDir = path.join(repoRoot, 'benchmarks', 'quiet', 'results');
const outDir = path.join(repoRoot, 'docs', 'outreach', 'audits');
const manifestOut = path.join(repoRoot, 'benchmarks', 'quiet', 'outreach.json');

function githubSlug(url) {
  const match = String(url).match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function counts(entries) {
  return entries.map(([value, count]) => `\`${value}\` ×${count}`).join(', ');
}

export function draftIssue(result) {
  const drift = (result.classified || []).filter((item) => item.category === 'drift');
  const topValues = topCounts(drift, 'value', 5);
  const topProperties = topCounts(drift, 'property', 5);
  const fallback = result.scale.source === 'fallback';
  const unreliable = !fallback && !assessScale(result.scale).plausible;
  const scale = result.scale.values.join(', ');
  const paths = result.paths.map((p) => `\`${p}\``).join(', ');
  const driftCount = result.summary.drift;

  const title = fallback || unreliable
    ? 'Spacing scale: where do your spacing tokens live? (audit from the Rhythmguard benchmark)'
    : `Spacing scale audit: ${driftCount} literal spacing values off your own token scale`;

  const lines = [
    'Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project\'s own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.',
    '',
    `**What was run.** \`npx rhythmguard audit . --scale auto\` at \`${result.sha}\` over ${paths}. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.`,
    '',
  ];

  if (unreliable) {
    lines.push(
      `**What it found.** Scale inference picked up variables that do not form a spacing scale (it derived \`${scale}\` from ${result.scale.files.slice(0, 2).map((f) => `\`${f}\``).join(', ')}${result.scale.files.length > 2 ? ' and others' : ''}), most likely component-local spacing variables rather than your tokens. Measured against that, it reported ${driftCount} values, which is my tool's mistake and not a number I will quote.`,
      '',
      '**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to prefer it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.',
    );
  } else if (fallback) {
    lines.push(
      `**What it found.** The audit could not find a spacing token set here (it looks for \`--space-*\` / \`--spacing-*\` custom properties, Sass \`$spacer\` / \`$spacing-*\` variables and maps, or a Tailwind \`--spacing\` base), so it measured against a default 4px scale and reported ${driftCount} literal values off that scale. That number says more about my token discovery than about your CSS, so I am not going to quote it.`,
      '',
      '**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to read it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.',
    );
  } else {
    lines.push(
      `**What it found.** Scale \`${scale}\` inferred from ${result.scale.source === 'scanned-css' ? 'your own spacing tokens in the stylesheets' : result.scale.source}. ${driftCount} literal spacing values are off that scale.`,
      '',
      `- Values: ${counts(topValues)}`,
      `- Properties: ${counts(topProperties)}`,
      '',
      'Three values usually explain most of the count, and each is a single decision: a step the scale is missing, a slip, or a token nobody defined. A property table led by sibling margins often means the parent could own the spacing with `gap`.',
      '',
      '**The ask.** Nothing is required. If the numbers are useful, I can open a small PR for the top value with before and after screenshots, or a one-rule Stylelint config at warning level that reports new off-scale values against your tokens and nothing else. If the findings are wrong for this codebase, tell me which ones; false positives are the most valuable report the tool gets and they change its defaults.',
    );
  }

  lines.push(
    '',
    'The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.',
    '',
    'Feel free to close this if it is not useful. Thanks for the CSS.',
    '',
  );

  return { title, body: lines.join('\n') };
}

export function draftAll({ only = null } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'benchmarks', 'quiet', 'repos.json'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const entries = [];
  for (const repo of manifest.repos) {
    if (only && !only.has(repo.name)) continue;
    const resultFile = path.join(resultsDir, `${repo.name}.json`);
    if (!fs.existsSync(resultFile)) continue;
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    const { body, title } = draftIssue(result);
    const file = path.join(outDir, `${repo.name}.md`);
    fs.writeFileSync(file, `# ${title}\n\n${body}`);
    entries.push({ name: repo.name, github: githubSlug(repo.url), title, bodyFile: path.relative(repoRoot, file), sha: result.sha, drift: result.summary.drift, scaleSource: result.scale.source });
  }
  fs.writeFileSync(manifestOut, `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex !== -1 ? new Set(String(process.argv[onlyIndex + 1] || '').split(',').filter(Boolean)) : null;
  const entries = draftAll({ only });
  process.stdout.write(`drafted ${entries.length} audit issues under docs/outreach/audits/\n`);
}
