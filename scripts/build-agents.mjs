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

export function buildPacks(block) {
  const footer = `Source: ${SOURCE} in the stylelint-plugin-rhythmguard repository (${SOURCE_URL}). Regenerate with \`npx rhythmguard init --agents\`.\n`;
  return {
    'claude-code/SKILL.md': [
      '---',
      'name: rhythmguard',
      'description: Keep CSS and Tailwind spacing on the project scale. Use when writing or changing CSS, SCSS, CSS Modules or Tailwind class strings, and before finishing any such change.',
      '---',
      '',
      block.trimEnd(),
      '',
      footer,
    ].join('\n'),
    'cursor/rhythmguard.mdc': [
      '---',
      'description: Spacing scale rules enforced by stylelint-plugin-rhythmguard',
      'globs: ["**/*.css", "**/*.scss", "**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.astro", "**/*.html"]',
      'alwaysApply: true',
      '---',
      '',
      block.trimEnd(),
      '',
      footer,
    ].join('\n'),
    'copilot/copilot-instructions.md': [
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
