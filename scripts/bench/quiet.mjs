#!/usr/bin/env node
/**
 * Quiet benchmark: run `rhythmguard audit --scale auto` against public design
 * systems and shared-config consumers, classify every finding, and report a
 * per-repo false-positive rate. Track B2 in docs/STRATEGY_2026-09.md.
 *
 *   npm run bench:quiet                 # clone/update every repo, audit, write docs/QUIET_BENCHMARK.md
 *   npm run bench:quiet -- --only radix-themes,open-props
 *   npm run bench:quiet -- --no-clone   # reuse existing checkouts
 *   npm run bench:quiet -- --report-only  # rebuild the markdown from stored results
 *   npm run bench:quiet -- --check        # fail if findings or scale differ from benchmarks/quiet/snapshots
 *   npm run bench:quiet -- --update-snapshots  # accept the current findings as the new snapshots
 *   npm run bench:quiet -- --latest       # ignore pinned commits and audit upstream HEAD
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { classifyFinding, compareSnapshot, summarize, toSnapshot } from './quiet-classify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const benchDir = path.join(repoRoot, 'benchmarks', 'quiet');
const reposDir = path.join(benchDir, 'repos');
const resultsDir = path.join(benchDir, 'results');
const labelsDir = path.join(benchDir, 'labels');
const snapshotsDir = path.join(benchDir, 'snapshots');
const manifestPath = path.join(benchDir, 'repos.json');
const rulesPath = path.join(benchDir, 'noise-rules.json');
const docPath = path.join(repoRoot, 'docs', 'QUIET_BENCHMARK.md');

const { createAuditReport } = await import(path.join(repoRoot, 'src', 'audit', 'index.js'));

function parseArgs(argv) {
  const args = { check: false, clone: true, latest: false, only: null, reportOnly: false, updateSnapshots: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--no-clone') args.clone = false;
    else if (token === '--report-only') args.reportOnly = true;
    else if (token === '--check') args.check = true;
    else if (token === '--update-snapshots') args.updateSnapshots = true;
    else if (token === '--latest') args.latest = true;
    else if (token === '--only') args.only = new Set(String(argv[++i] || '').split(',').filter(Boolean));
  }
  return args;
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/**
 * Checkout pinned to the commit recorded in the snapshot, so upstream churn
 * cannot fail our CI. `--latest` fetches the default branch head instead.
 */
function ensureCheckout(repo, pinnedCommit) {
  const dir = path.join(reposDir, repo.name);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(reposDir, { recursive: true });
    run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--quiet', repo.url, dir]);
  }
  const target = pinnedCommit || 'HEAD';
  run('git', ['-C', dir, 'fetch', '--depth', '1', '--quiet', 'origin', target]);
  run('git', ['-C', dir, 'checkout', '--detach', '--quiet', 'FETCH_HEAD']);
  run('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', ...repo.paths]);
  const commit = run('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
  return { commit, dir, sha: commit.slice(0, 7) };
}

function currentCheckout(repo) {
  const dir = path.join(reposDir, repo.name);
  const commit = run('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
  return { commit, dir, sha: commit.slice(0, 7) };
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The benchmark measures the `recommended` profile: use-scale on CSS plus the
 * Tailwind class-string rule. prefer-token's "raw value could be a token"
 * findings are counted separately as token opportunities, not as drift.
 */
function recommendedFindings(report) {
  return [
    ...report.findings.css
      .filter((finding) => finding.type === 'off-scale')
      .map((finding) => ({ ...finding, surface: 'css' })),
    ...report.findings.tailwind.map((finding) => ({ ...finding, surface: 'tailwind' })),
  ];
}

function tokenOpportunityCount(report) {
  return report.findings.css.filter((finding) => finding.type === 'token-opportunity').length;
}

function topValues(findings, limit = 8) {
  const counts = new Map();
  for (const finding of findings) {
    const value = finding.value || finding.rawValue;
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function auditRepo(repo, checkout, rules) {
  const labels = loadJson(path.join(labelsDir, `${repo.name}.json`), {});
  const previousCwd = process.cwd();
  process.chdir(checkout.dir);
  let report;
  try {
    report = await createAuditReport({
      dir: '.',
      ignorePatterns: repo.ignore || [],
      noConfig: true,
      scale: 'auto',
    });
  } finally {
    process.chdir(previousCwd);
  }

  const classified = recommendedFindings(report).map((finding) => ({
    ...finding,
    ...classifyFinding(finding, rules, labels),
  }));
  const summary = summarize(classified);
  const examples = {};
  for (const item of classified) {
    if (!examples[item.category]) examples[item.category] = [];
    if (examples[item.category].length < 5) {
      examples[item.category].push({ file: item.file, line: item.line, text: item.text, value: item.value || item.rawValue });
    }
  }

  return {
    auditedAt: new Date().toISOString(),
    classified: classified.map((item) => ({
      category: item.category,
      file: item.file,
      line: item.line,
      value: item.value || item.rawValue || '',
    })),
    commit: checkout.commit,
    cssFilesScanned: report.cssFilesScanned,
    examples,
    filesWithIssues: report.filesWithIssues,
    findingsPer100CssFiles: report.cssFilesScanned > 0
      ? Math.round((report.findings.css.filter((f) => f.type === 'off-scale').length / report.cssFilesScanned) * 100)
      : 0,
    labelsApplied: Object.keys(labels).length,
    name: repo.name,
    notes: repo.notes || '',
    paths: repo.paths,
    scale: report.scale,
    scaleCleanliness: report.scaleCleanliness,
    sha: checkout.sha,
    summary,
    tailwindFindings: report.findings.tailwind.length,
    templateFilesScanned: report.templateFilesScanned,
    tokenOpportunities: tokenOpportunityCount(report),
    topOffScaleValues: topValues(classified.filter((item) => item.category === 'drift')),
    url: repo.url,
  };
}

function pct(value) {
  return `${value}%`;
}

function renderDoc(results, rules) {
  const lines = [
    '# Quiet Benchmark',
    '',
    'Track B2 in [`STRATEGY_2026-09.md`](./STRATEGY_2026-09.md). Rhythmguard is only embeddable in a shared config if it is quiet on codebases its author does not control. This page measures that.',
    '',
    `Generated by \`npm run bench:quiet\` on ${new Date().toISOString().slice(0, 10)}. Checkouts and raw results live under \`benchmarks/quiet/\` and are not committed; the manifest (\`repos.json\`), the classification rules (\`noise-rules.json\`) and any per-repo review labels (\`labels/<repo>.json\`) are.`,
    '',
    '## Method',
    '',
    '1. Sparse, shallow clone of each repository, pinned to the commit recorded in `benchmarks/quiet/snapshots/<repo>.json` so upstream churn cannot move the numbers; `--latest` audits the default branch head instead. Paths are limited to those listed in the manifest.',
    '2. `rhythmguard audit --scale auto` over the checkout. The scale is inferred from the repository\'s own spacing tokens when it has at least three distinct values (`--space-*`, `--spacing-*`, prefixed variants, calc-wrapped values, or a Tailwind v4 `--spacing` base); otherwise the audit falls back to `rhythmic-4` and the row says so.',
    '3. Only the `recommended` profile is scored: `use-scale` findings on CSS plus the Tailwind class-string rule. `prefer-token` findings (a raw value that could be a token) are reported as token opportunities in their own column and never count as drift.',
    '4. Every scored finding is classified. Path heuristics mark generated, vendored and test CSS as `noise:*`. Value heuristics, when any are configured, mark accepted exceptions as `allowance:*`; hairlines of one pixel or less are exempted by the rules themselves (`allowHairlines`, default on) since 2.2 and no longer appear as findings. Per-repo labels written after manual review override the heuristics. Everything else is `drift`.',
    '5. False-positive rate = (noise + allowance) / total scored findings. The target before outreach is under 5% with heuristics only, then confirmed by maintainer review.',
    '',
    'Findings classified as `drift` are, by construction, the values the tool would ask a maintainer to change. A low false-positive rate with a high drift count means the tool is quiet and the repo has real drift. A low drift count with a high false-positive rate means the tool needs better defaults, not the repo.',
    '',
    '## Results',
    '',
    '| Repo | Commit | CSS files | Template files | Scored findings | Drift | Noise | Allowance | FP rate | Token opportunities | Scale source |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const r of results) {
    const noise = Object.entries(r.summary.byCategory).filter(([k]) => k.startsWith('noise:')).reduce((a, [, v]) => a + v, 0);
    const allowance = Object.entries(r.summary.byCategory).filter(([k]) => k.startsWith('allowance:')).reduce((a, [, v]) => a + v, 0);
    const scaleSource = r.scale.source === 'fallback' ? 'fallback (no spacing tokens found)' : `${r.scale.source} (${r.scale.tokenCount} tokens)`;
    lines.push(`| [${r.name}](${r.url}) | \`${r.sha}\` | ${r.cssFilesScanned} | ${r.templateFilesScanned} | ${r.summary.total} | ${r.summary.drift} | ${noise} | ${allowance} | ${pct(r.summary.falsePositiveRate)} | ${r.tokenOpportunities ?? 0} | ${scaleSource} |`);
  }

  lines.push('', '## Per-repo detail', '');
  for (const r of results) {
    lines.push(`### ${r.name}`, '');
    lines.push(`Paths: ${r.paths.map((p) => `\`${p}\``).join(', ')}. ${r.notes}`.trim(), '');
    lines.push(`Inferred scale: \`${r.scale.values.join(', ')}\` from ${r.scale.source}${r.scale.files.length ? ` (${r.scale.files.slice(0, 3).join(', ')}${r.scale.files.length > 3 ? `, +${r.scale.files.length - 3} more` : ''})` : ''}.`, '');
    if (r.topOffScaleValues.length > 0) {
      lines.push('Top drift values:', '');
      lines.push('| Value | Count |', '| --- | ---: |');
      for (const [value, count] of r.topOffScaleValues) lines.push(`| \`${value}\` | ${count} |`);
      lines.push('');
    }
    const categories = Object.keys(r.summary.byCategory).filter((c) => c !== 'drift');
    if (categories.length > 0) {
      lines.push('False-positive examples by category:', '');
      for (const category of categories) {
        lines.push(`- \`${category}\` (${r.summary.byCategory[category]})`);
        for (const example of r.examples[category] || []) {
          lines.push(`  - \`${example.file}:${example.line}\` ${example.value ? `\`${example.value}\`` : ''}`);
        }
      }
      lines.push('');
    }
    if (r.summary.total > 0 && r.examples.drift) {
      lines.push('Drift examples for maintainer review:', '');
      for (const example of r.examples.drift) lines.push(`- \`${example.file}:${example.line}\` \`${example.value}\``);
      lines.push('');
    }
  }

  lines.push('## Classification rules in force', '');
  for (const rule of rules.noisePaths || []) lines.push(`- \`${rule.category}\`: path matches \`${rule.pattern}\``);
  for (const rule of rules.allowances || []) lines.push(`- \`${rule.category}\`: value in ${rule.values.map((v) => `\`${v}\``).join(', ')}${rule.reason ? `. ${rule.reason}` : ''}`);
  lines.push('');
  lines.push('## Reading the numbers honestly', '');
  lines.push('- CI runs `npm run bench:quiet -- --check` on every change. It fails when the finding set or the inferred scale of any pinned repository differs from its committed snapshot, so a rule change that alters behaviour on real design systems has to be reviewed and accepted with `--update-snapshots`.');
  lines.push('- Heuristic classification is a floor, not a verdict. A finding labelled `drift` may still be intentional; only a maintainer can say. Per-repo labels exist for exactly that, and the FP rate should be re-read after review.');
  lines.push('- Repositories whose scale fell back to `rhythmic-4` were measured against a scale they never chose. Their drift counts say more about Rhythmguard\'s token discovery than about their CSS. Each fallback is a to-do for `scale: "auto"` inference.');
  lines.push('- SCSS is audited through postcss-scss. Sass variables and functions are not evaluated, so a system that routes all spacing through `$spacer` or `spacing()` shows few literal findings and a fallback scale; that is a token-discovery gap, not cleanliness.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const manifest = loadJson(manifestPath, { repos: [] });
const rules = loadJson(rulesPath, { allowances: [], noisePaths: [] });
fs.mkdirSync(resultsDir, { recursive: true });

const selected = manifest.repos.filter((repo) => !args.only || args.only.has(repo.name));
const results = [];
const checkFailures = [];
fs.mkdirSync(snapshotsDir, { recursive: true });

for (const repo of manifest.repos) {
  const resultFile = path.join(resultsDir, `${repo.name}.json`);
  const snapshotFile = path.join(snapshotsDir, `${repo.name}.json`);
  const snapshot = loadJson(snapshotFile, null);
  if (args.reportOnly || !selected.includes(repo)) {
    if (fs.existsSync(resultFile)) results.push(loadJson(resultFile));
    continue;
  }

  process.stdout.write(`▸ ${repo.name} … `);
  try {
    const pinned = args.latest ? null : (snapshot && snapshot.commit) || null;
    const checkout = args.clone ? ensureCheckout(repo, pinned) : currentCheckout(repo);
    const result = await auditRepo(repo, checkout, rules);
    fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
    results.push(result);
    process.stdout.write(`${result.summary.total} findings, ${result.summary.drift} drift, FP ${result.summary.falsePositiveRate}%, scale ${result.scale.source}, @${result.sha}\n`);

    const current = { ...toSnapshot(result), commit: result.commit };
    if (args.updateSnapshots || !snapshot) {
      fs.writeFileSync(snapshotFile, `${JSON.stringify(current, null, 2)}\n`);
      if (!snapshot) process.stdout.write(`  snapshot created: ${path.relative(repoRoot, snapshotFile)}\n`);
    } else if (args.check) {
      const diff = compareSnapshot(snapshot, current);
      if (diff.changed) {
        checkFailures.push(repo.name);
        process.stdout.write(`  CHANGED vs snapshot: ${diff.reasons.join('; ')}\n`);
        for (const key of diff.added.slice(0, 10)) process.stdout.write(`    + ${key}\n`);
        for (const key of diff.removed.slice(0, 10)) process.stdout.write(`    - ${key}\n`);
      }
    }
  } catch (error) {
    process.stdout.write(`FAILED: ${error.message.split('\n')[0]}\n`);
    if (args.check) checkFailures.push(repo.name);
  }
}

results.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(docPath, renderDoc(results, rules));
process.stdout.write(`\nWrote ${path.relative(repoRoot, docPath)} (${results.length} repos)\n`);

if (args.check && checkFailures.length > 0) {
  process.stdout.write(`\nQuiet benchmark changed for: ${checkFailures.join(', ')}.\n`);
  process.stdout.write('If the change is intended, review the diff above, then run `npm run bench:quiet -- --update-snapshots` and commit benchmarks/quiet/snapshots/.\n');
  process.exitCode = 1;
}
