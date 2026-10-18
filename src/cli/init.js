'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function createPrompter() {
  if (!process.stdin.isTTY) {
    const answers = fs.readFileSync(0, 'utf8').split(/\r?\n/);
    let answerIndex = 0;

    return {
      ask(question) {
        process.stdout.write(question);
        const answer = answers[answerIndex] || '';
        answerIndex += 1;
        return Promise.resolve(answer.trim().toLowerCase());
      },
      close() {},
    };
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask(question) {
      return new Promise((resolve) => {
        rl.question(question, (answer) => {
          resolve(answer.trim().toLowerCase());
        });
      });
    },
    close() {
      rl.close();
    },
  };
}

function detect() {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, 'package.json');

  let pkg = {};
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const hasTailwindConfig =
    fs.existsSync(path.join(cwd, 'tailwind.config.js')) ||
    fs.existsSync(path.join(cwd, 'tailwind.config.cjs')) ||
    fs.existsSync(path.join(cwd, 'tailwind.config.mjs')) ||
    fs.existsSync(path.join(cwd, 'tailwind.config.ts'));

  const hasTailwindDep = Boolean(
    allDeps.tailwindcss || allDeps['@tailwindcss/postcss'],
  );

  const hasNextConfig =
    fs.existsSync(path.join(cwd, 'next.config.js')) ||
    fs.existsSync(path.join(cwd, 'next.config.mjs')) ||
    fs.existsSync(path.join(cwd, 'next.config.ts'));

  const activeConfig = findActiveStylelintConfig(cwd);
  const hasExistingConfig = activeConfig !== null;

  const tailwind = hasTailwindConfig || hasTailwindDep;
  const nextjs = hasNextConfig;

  return { activeConfig, tailwind, nextjs, hasExistingConfig };
}

/**
 * Where Stylelint looks for a config in one directory, in its order. Stylelint
 * searches with cosmiconfig and does not expose the file it picks, so this is
 * cosmiconfig 9's default list for the module name "stylelint". The first hit
 * wins: package.json counts only with a "stylelint" key, and an empty file is
 * skipped, as cosmiconfig skips it.
 */
const STYLELINT_SEARCH_PLACES = [
  'package.json',
  '.stylelintrc',
  '.stylelintrc.json',
  '.stylelintrc.yaml',
  '.stylelintrc.yml',
  '.stylelintrc.js',
  '.stylelintrc.ts',
  '.stylelintrc.cjs',
  '.stylelintrc.mjs',
  '.config/stylelintrc',
  '.config/stylelintrc.json',
  '.config/stylelintrc.yaml',
  '.config/stylelintrc.yml',
  '.config/stylelintrc.js',
  '.config/stylelintrc.ts',
  '.config/stylelintrc.cjs',
  '.config/stylelintrc.mjs',
  'stylelint.config.js',
  'stylelint.config.ts',
  'stylelint.config.cjs',
  'stylelint.config.mjs',
];

/**
 * The config file Stylelint loads in `cwd`, or null. `kind` says what init can
 * do with it: 'json' is rewritten in place; 'package' (the package.json key),
 * 'yaml' and 'code' (JS or TS) get a snippet to add by hand, because writing a
 * .stylelintrc.json next to them changes nothing: Stylelint never reads it.
 */
function findActiveStylelintConfig(cwd = process.cwd()) {
  for (const file of STYLELINT_SEARCH_PLACES) {
    let content;
    try {
      content = fs.readFileSync(path.join(cwd, file), 'utf8');
    } catch {
      continue;
    }

    if (file === 'package.json') {
      let pkg = null;
      try {
        pkg = JSON.parse(content);
      } catch {
        // cosmiconfig would throw here; a broken package.json is no Stylelint config
      }
      if (pkg && typeof pkg === 'object' && pkg.stylelint !== undefined && pkg.stylelint !== null) {
        return { file, kind: 'package' };
      }
      continue;
    }

    if (content.trim() === '') {
      continue;
    }

    return { file, kind: configKind(file, content) };
  }

  return null;
}

function configKind(file, content) {
  const extension = path.extname(file);
  if (extension === '.json') {
    return 'json';
  }
  if (extension === '.yaml' || extension === '.yml') {
    return 'yaml';
  }
  if (extension === '') {
    // .stylelintrc holds JSON or YAML; only JSON is rewritten.
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      return 'yaml';
    }
  }
  return 'code';
}

/** What to add to a config init cannot rewrite, in that file's own syntax. */
function configSnippet(kind, config) {
  if (kind === 'package') {
    return JSON.stringify({ stylelint: config }, null, 2).split('\n').slice(1, -1).map((line) => line.slice(2)).join('\n');
  }
  if (kind === 'yaml') {
    return Object.entries(config)
      .map(([key, values]) => `${key}:\n${values.map((value) => `  - ${JSON.stringify(value)}`).join('\n')}`)
      .join('\n');
  }
  return Object.entries(config)
    .map(([key, values]) => `${key}: ${JSON.stringify(values)},`)
    .join('\n');
}

function selectProfile(stack) {
  if (stack.tailwind) {
    return 'tailwind';
  }
  return 'recommended';
}

const AGENT_TARGETS = {
  claude: { source: 'claude-code/SKILL.md', target: path.join('.claude', 'skills', 'rhythmguard', 'SKILL.md'), mode: 'write' },
  cursor: { source: 'cursor/rhythmguard.mdc', target: path.join('.cursor', 'rules', 'rhythmguard.mdc'), mode: 'write' },
  copilot: { source: 'copilot/copilot-instructions.md', target: path.join('.github', 'copilot-instructions.md'), mode: 'append' },
};
const AGENT_BLOCK_START = '<!-- rhythmguard:agents:start -->';
const AGENT_BLOCK_END = '<!-- rhythmguard:agents:end -->';

function parseInitArgs(argv) {
  const parsed = { agents: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--agents') {
      parsed.agents = String(argv[++index] || 'all').toLowerCase();
    } else if (arg.startsWith('--agents=')) {
      parsed.agents = arg.slice('--agents='.length).toLowerCase();
    }
  }
  return parsed;
}

/**
 * Copies the generated packs under <package>/agents into the locations each
 * agent reads. Claude Code and Cursor files are owned by Rhythmguard and
 * overwritten; copilot-instructions.md is shared, so the block is appended
 * between markers and replaced in place on later runs.
 */
function installAgents(selection, cwd = process.cwd()) {
  const names = selection === 'all' ? Object.keys(AGENT_TARGETS) : [selection];
  const unknown = names.filter((name) => !AGENT_TARGETS[name]);
  if (unknown.length > 0) {
    throw new Error(`Unknown agents target "${unknown[0]}". Use claude, cursor, copilot or all.`);
  }

  const packsDir = path.join(__dirname, '..', '..', 'agents');
  const written = [];
  for (const name of names) {
    const { mode, source, target } = AGENT_TARGETS[name];
    const content = fs.readFileSync(path.join(packsDir, source), 'utf8');
    const targetPath = path.join(cwd, target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (mode === 'append' && fs.existsSync(targetPath)) {
      const existing = fs.readFileSync(targetPath, 'utf8');
      const block = `${AGENT_BLOCK_START}\n${content.trimEnd()}\n${AGENT_BLOCK_END}\n`;
      const start = existing.indexOf(AGENT_BLOCK_START);
      const end = existing.indexOf(AGENT_BLOCK_END);
      const next = start !== -1 && end !== -1
        ? `${existing.slice(0, start)}${block}${existing.slice(end + AGENT_BLOCK_END.length).replace(/^\n/, '')}`
        : `${existing.trimEnd()}\n\n${block}`;
      fs.writeFileSync(targetPath, next);
    } else {
      fs.writeFileSync(targetPath, content);
    }
    written.push(target);
  }
  return written;
}

async function run() {
  const args = parseInitArgs(process.argv.slice(3));

  if (args.agents) {
    let written;
    try {
      written = installAgents(args.agents);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    process.stdout.write('\nRhythmguard agent packs\n\n');
    for (const file of written) {
      process.stdout.write(`✓ Wrote ${file}\n`);
    }
    process.stdout.write('\nThe block is the one in docs/FOR_AGENTS.md. Trim it to the lines that apply.\n\n');
    return;
  }

  const prompter = createPrompter();

  try {
    process.stdout.write('\nRhythmguard Init\n\n');

    const stack = detect();

    // Report detection
    const detected = [];
    if (stack.tailwind) detected.push('Tailwind CSS');
    if (stack.nextjs) detected.push('Next.js');
    if (detected.length > 0) {
      process.stdout.write(`Detected: ${detected.join(', ')}\n`);
    } else {
      process.stdout.write('Detected: plain CSS project\n');
    }

    const profile = selectProfile(stack);
    const config = {
      extends: [`stylelint-plugin-rhythmguard/configs/${profile}`],
      // Next.js build output is generated CSS; never lint it.
      ...(stack.nextjs ? { ignoreFiles: ['.next/**', 'out/**', 'node_modules/**'] } : {}),
    };

    // A .stylelintrc.json next to the config Stylelint actually loads is either
    // never read (package.json, a YAML .stylelintrc) or silently takes over
    // from it (YAML, JS and TS files later in the search). When that config is
    // not JSON, say what to add to it and write nothing.
    const active = stack.activeConfig;
    if (active && active.kind !== 'json') {
      const where = active.kind === 'package' ? 'the "stylelint" key in package.json' : active.file;
      const shadowsJson = STYLELINT_SEARCH_PLACES.indexOf(active.file) < STYLELINT_SEARCH_PLACES.indexOf('.stylelintrc.json');
      process.stdout.write(`\nProfile: ${profile}\n`);
      process.stdout.write(shadowsJson
        ? `\n⚠ Stylelint loads ${where} before .stylelintrc.json, so it would never read a .stylelintrc.json.\n`
        : `\n⚠ Stylelint loads ${where}; a new .stylelintrc.json would replace it and leave it unused.\n`);
      process.stdout.write(`Add this to ${active.kind === 'package' ? 'package.json' : active.file}, merging with what is there:\n\n`);
      process.stdout.write(`${configSnippet(active.kind, config)}\n\n`);
      process.stdout.write('Nothing was written.\n\n');
      return;
    }

    // Warn about existing config
    if (stack.hasExistingConfig) {
      process.stdout.write('\n⚠ Existing Stylelint config found.\n');
      const answer = await prompter.ask('Overwrite? (y/n) ');
      if (answer !== 'y' && answer !== 'yes') {
        process.stdout.write('Aborted.\n');
        process.exit(0);
      }
    }

    process.stdout.write(`\nProfile: ${profile}\n`);

    const targetFile = active ? active.file : '.stylelintrc.json';
    const answer = await prompter.ask(`Write ${targetFile}? (y/n) `);
    if (answer !== 'y' && answer !== 'yes') {
      process.stdout.write('Aborted.\n');
      process.exit(0);
    }

    const configPath = path.join(process.cwd(), targetFile);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    process.stdout.write(`\n✓ Wrote ${configPath}\n`);
    process.stdout.write(`\nNext steps:\n`);
    process.stdout.write(`  npx stylelint "src/**/*.css"\n\n`);
  } finally {
    prompter.close();
  }
}

module.exports = { AGENT_TARGETS, detect, findActiveStylelintConfig, installAgents, run, selectProfile };

if (require.main === module) {
  run();
}
