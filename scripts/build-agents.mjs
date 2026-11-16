#!/usr/bin/env node
/**
 * Generates every agent-facing file from the single source block in
 * docs/FOR_AGENTS.md, so none of them can drift from the docs. A test compares
 * the committed files with this output.
 *
 * - agents/: the packs `rhythmguard init --agents` copies (in the npm package)
 * - skills/rhythmguard/SKILL.md: where the skills CLI (`npx skills add`) looks
 * - plugins/rhythmguard and .claude-plugin/marketplace.json: the Claude Code
 *   plugin marketplace (`claude plugin marketplace add`)
 * - llms.txt and docs/llms.txt: the docs an agent should read, at the
 *   repository root and on the GitHub Pages site (served from docs/)
 *
 * The files outside agents/ serve installs from the GitHub repository and are
 * not in the npm package.
 *
 *   npm run build:agents
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'docs/FOR_AGENTS.md';
const REPO = 'PetriLahdelma/stylelint-plugin-rhythmguard';
const SOURCE_URL = `https://github.com/${REPO}/blob/main/docs/FOR_AGENTS.md`;
const PAGES_URL = 'https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/';
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/`;
const DESCRIPTION = 'Keep CSS and Tailwind spacing on the project scale. Use when writing or changing CSS, SCSS, CSS Modules or Tailwind class strings, and before finishing any such change.';

export function extractAgentsBlock(markdown) {
  const match = markdown.match(/```md\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error(`No \`\`\`md block found in ${SOURCE}`);
  }
  return `${match[1].trim()}\n`;
}

/** Where spacing is written: stylesheets and the files that carry class strings. */
export const PACK_GLOBS = ['**/*.css', '**/*.scss', '**/*.jsx', '**/*.tsx', '**/*.vue', '**/*.svelte', '**/*.astro', '**/*.html'];

const SOURCE_LINE = `Source: ${SOURCE} in the stylelint-plugin-rhythmguard repository (${SOURCE_URL}).`;

/** The Claude Code skill, as init installs it and as the plugin ships it. */
function claudeSkill(block, footer) {
  return [
    '---',
    'name: rhythmguard',
    `description: ${DESCRIPTION}`,
    'when_to_use: Adding or changing padding, margin, gap, inset or other spacing in a stylesheet or a class string; reviewing a diff that does.',
    // Only the exact read-only audit the block asks for. Stylelint and ESLint
    // load JavaScript configs and plugins, rhythmguard fix and init write
    // files, and `audit --tailwind-config` loads a file with require(), so
    // every other command stays with the user's own approval.
    'allowed-tools: Bash(npx rhythmguard audit . --scale auto --format json)',
    'paths:',
    ...PACK_GLOBS.map((glob) => `  - "${glob}"`),
    '---',
    '',
    block.trimEnd(),
    '',
    footer,
  ].join('\n');
}

export function buildPacks(block) {
  const footer = `${SOURCE_LINE} Regenerate with \`npx rhythmguard init --agents\`.\n`;
  return {
    // Claude Code skill frontmatter: https://code.claude.com/docs/en/skills
    'claude-code/SKILL.md': claudeSkill(block, footer),
    // Cursor rule: auto-attached when a matching file is in context. With
    // alwaysApply true Cursor ignores the globs and loads the rule into every chat.
    'cursor/rhythmguard.mdc': [
      '---',
      'description: Spacing scale rules enforced by stylelint-plugin-rhythmguard',
      `globs: ${PACK_GLOBS.join(', ')}`,
      'alwaysApply: false',
      '---',
      '',
      block.trimEnd(),
      '',
      footer,
    ].join('\n'),
    // Copilot path-specific instructions: .github/instructions/*.instructions.md
    'copilot/rhythmguard.instructions.md': [
      '---',
      `applyTo: "${PACK_GLOBS.join(',')}"`,
      '---',
      '',
      block.trimEnd(),
      '',
      footer,
    ].join('\n'),
    // The generic block `init --agents agents` and `--agents claude-md` merge
    // into AGENTS.md and CLAUDE.md, before the generated project section.
    'agents-md/rhythmguard.md': [block.trimEnd(), '', `${SOURCE_LINE}\n`].join('\n'),
  };
}

/**
 * The docs an agent should read, for llms.txt (https://llmstxt.org): docs/
 * pages by their GitHub Pages URL (Pages serves docs/, Markdown as
 * text/markdown), other files by their raw URL. Each entry is [path, title, note].
 */
export const LLMS_SECTIONS = [
  ['Start here', [
    ['docs/SETUP.md', 'Set up Rhythmguard', 'Steps an agent runs to install, configure and gate Rhythmguard in a project'],
    ['docs/FOR_AGENTS.md', 'Rhythmguard for coding agents', 'The instruction block, the agent packs and the commands that return JSON'],
    ['README.md', 'README', 'What Rhythmguard checks, and the three packages'],
  ]],
  ['Rules', [
    ['docs/rules/use-scale.md', 'use-scale', 'Off-scale spacing values in stylesheets'],
    ['docs/rules/prefer-token.md', 'prefer-token', 'Raw values that a design token holds'],
    ['docs/rules/no-offscale-transform.md', 'no-offscale-transform', 'Off-scale translate values'],
    ['docs/rules/tailwind-class-use-scale.md', 'tailwind-class-use-scale', 'The ESLint rule for Tailwind arbitrary spacing in class strings'],
    ['packages/eslint-plugin-rhythmguard/README.md', 'eslint-plugin-rhythmguard', 'Installing and configuring the ESLint plugin, which needs no Stylelint'],
  ]],
  ['Setup and CI', [
    ['docs/CONFIGS.md', 'Shared configs', 'recommended, strict, tailwind, embed and motion'],
    ['docs/TAILWIND.md', 'Tailwind integration', 'Tailwind v3 and v4 projects'],
    ['docs/FRAMEWORKS.md', 'Framework integration', 'Next.js, Vue, Svelte, Astro and CSS Modules'],
    ['docs/AUDIT.md', 'rhythmguard audit', 'The audit command and its JSON contract'],
    ['docs/CI_ADOPTION.md', 'CI adoption', 'Write a baseline and gate only new drift'],
    ['docs/SCALE_PRESETS.md', 'Scale presets', 'The built-in scales'],
  ]],
  ['Optional', [
    ['docs/rules/use-motion-scale.md', 'use-motion-scale', 'Motion durations and easings'],
    ['docs/rules/tailwind-class-use-motion-scale.md', 'tailwind-class-use-motion-scale', 'Motion classes in class strings'],
    ['docs/AUDIT_API_EXAMPLES.md', 'Audit API examples', 'The audit from JavaScript'],
    ['docs/MIGRATING_TO_3.md', 'Migrating to 3.0', 'Changes from 2.x'],
    ['SECURITY.md', 'Security', 'What the packages read, run and write'],
    ['CHANGELOG.md', 'Changelog', 'Every release'],
  ]],
];

export function llmsUrl(file) {
  return file.startsWith('docs/') ? `${PAGES_URL}${file.slice('docs/'.length)}` : `${RAW_URL}${file}`;
}

export function buildLlmsTxt() {
  return [
    '# Rhythmguard',
    '',
    "> Catches off-scale spacing in CSS and Tailwind class strings and snaps it to the project's scale or tokens: Stylelint rules (`stylelint-plugin-rhythmguard`), an ESLint plugin for class strings (`eslint-plugin-rhythmguard`, no Stylelint needed) and an audit CLI (`npx rhythmguard`). Deterministic, no network, no telemetry.",
    '',
    'An agent setting Rhythmguard up in a project follows SETUP.md. An agent working in a project that has it reads FOR_AGENTS.md and runs `npx rhythmguard audit . --scale auto --format json`.',
    '',
    ...LLMS_SECTIONS.flatMap(([title, entries]) => [
      `## ${title}`,
      '',
      ...entries.map(([file, name, note]) => `- [${name}](${llmsUrl(file)}): ${note}`),
      '',
    ]),
  ].join('\n');
}

/**
 * The files that serve installs from the GitHub repository, by path from the
 * repository root: the skills CLI's skill, the Claude Code plugin and its
 * marketplace, and llms.txt.
 */
export function buildRepoFiles(block) {
  const pluginDescription = 'Keeps CSS and Tailwind spacing on the project scale: a skill that loads for stylesheet and component files and runs the Rhythmguard audit.';
  const llms = buildLlmsTxt();
  return {
    // The skills CLI (vercel-labs/skills) scans skills/<name>/SKILL.md. Only
    // the Agent Skills spec's keys (https://agentskills.io/specification), so
    // every agent and validator that reads it accepts it. No allowed-tools: the
    // spec reads it as a space-separated list, which would split the one exact
    // command the Claude Code skill pre-approves.
    'skills/rhythmguard/SKILL.md': [
      '---',
      'name: rhythmguard',
      `description: ${DESCRIPTION}`,
      'license: MIT',
      '---',
      '',
      block.trimEnd(),
      '',
      `${SOURCE_LINE} Update it with \`npx skills update rhythmguard\`.\n`,
    ].join('\n'),
    // A Claude Code plugin in a directory of its own: a plugin at the
    // repository root would read agents/ as plugin subagents. No version, so
    // installs track the repository's commits.
    'plugins/rhythmguard/.claude-plugin/plugin.json': `${JSON.stringify({
      name: 'rhythmguard',
      description: pluginDescription,
      author: { name: 'Petri Lahdelma', url: 'https://github.com/PetriLahdelma' },
      homepage: `https://github.com/${REPO}`,
      repository: `https://github.com/${REPO}`,
      license: 'MIT',
      keywords: ['css', 'tailwindcss', 'spacing', 'design-tokens', 'stylelint', 'eslint'],
    }, null, 2)}\n`,
    'plugins/rhythmguard/skills/rhythmguard/SKILL.md': claudeSkill(block, `${SOURCE_LINE}\n`),
    '.claude-plugin/marketplace.json': `${JSON.stringify({
      name: 'rhythmguard',
      owner: { name: 'Petri Lahdelma', url: 'https://github.com/PetriLahdelma' },
      description: 'The Rhythmguard plugin for Claude Code.',
      plugins: [
        { name: 'rhythmguard', source: './plugins/rhythmguard', description: pluginDescription },
      ],
    }, null, 2)}\n`,
    'llms.txt': llms,
    // GitHub Pages serves docs/, so the site's llms.txt lives there.
    'docs/llms.txt': llms,
  };
}

function readBlock() {
  return extractAgentsBlock(fs.readFileSync(path.join(repoRoot, SOURCE), 'utf8'));
}

function writeAll(base, files) {
  const written = [];
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(base, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    written.push(path.relative(repoRoot, target));
  }
  return written;
}

export function writePacks(outDir = path.join(repoRoot, 'agents')) {
  return writeAll(outDir, buildPacks(readBlock()));
}

export function writeRepoFiles(base = repoRoot) {
  return writeAll(base, buildRepoFiles(readBlock()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of [...writePacks(), ...writeRepoFiles()]) {
    process.stdout.write(`wrote ${file}\n`);
  }
}
