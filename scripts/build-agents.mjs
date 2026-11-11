#!/usr/bin/env node
/**
 * Generates the installable agent packs under agents/ from the single source
 * block in docs/FOR_AGENTS.md, so the three files cannot drift from the docs.
 * A test compares the committed files with this output.
 *
 *   npm run build:agents
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'docs/FOR_AGENTS.md';
const SOURCE_URL = 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_AGENTS.md';

export function extractAgentsBlock(markdown) {
  const match = markdown.match(/```md\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error(`No \`\`\`md block found in ${SOURCE}`);
  }
  return `${match[1].trim()}\n`;
}

/** Where spacing is written: stylesheets and the files that carry class strings. */
export const PACK_GLOBS = ['**/*.css', '**/*.scss', '**/*.jsx', '**/*.tsx', '**/*.vue', '**/*.svelte', '**/*.astro', '**/*.html'];

export function buildPacks(block) {
  const footer = `Source: ${SOURCE} in the stylelint-plugin-rhythmguard repository (${SOURCE_URL}). Regenerate with \`npx rhythmguard init --agents\`.\n`;
  return {
    // Claude Code skill frontmatter: https://code.claude.com/docs/en/skills
    'claude-code/SKILL.md': [
      '---',
      'name: rhythmguard',
      'description: Keep CSS and Tailwind spacing on the project scale. Use when writing or changing CSS, SCSS, CSS Modules or Tailwind class strings, and before finishing any such change.',
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
    ].join('\n'),
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
  };
}

export function writePacks(outDir = path.join(repoRoot, 'agents')) {
  const block = extractAgentsBlock(fs.readFileSync(path.join(repoRoot, SOURCE), 'utf8'));
  const written = [];
  for (const [relative, content] of Object.entries(buildPacks(block))) {
    const target = path.join(outDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    written.push(path.relative(repoRoot, target));
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of writePacks()) {
    process.stdout.write(`wrote ${file}\n`);
  }
}
