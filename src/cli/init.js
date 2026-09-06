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

  const hasExistingConfig =
    fs.existsSync(path.join(cwd, '.stylelintrc')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.json')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.js')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.cjs')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.mjs')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.yml')) ||
    fs.existsSync(path.join(cwd, '.stylelintrc.yaml')) ||
    fs.existsSync(path.join(cwd, 'stylelint.config.js')) ||
    fs.existsSync(path.join(cwd, 'stylelint.config.cjs')) ||
    fs.existsSync(path.join(cwd, 'stylelint.config.mjs')) ||
    Boolean(pkg.stylelint);

  const tailwind = hasTailwindConfig || hasTailwindDep;
  const nextjs = hasNextConfig;

  return { tailwind, nextjs, hasExistingConfig };
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

    // Warn about existing config
    if (stack.hasExistingConfig) {
      process.stdout.write('\n⚠ Existing Stylelint config found.\n');
      const answer = await prompter.ask('Overwrite? (y/n) ');
      if (answer !== 'y' && answer !== 'yes') {
        process.stdout.write('Aborted.\n');
        process.exit(0);
      }
    }

    const profile = selectProfile(stack);
    process.stdout.write(`\nProfile: ${profile}\n`);

    const answer = await prompter.ask('Write .stylelintrc.json? (y/n) ');
    if (answer !== 'y' && answer !== 'yes') {
      process.stdout.write('Aborted.\n');
      process.exit(0);
    }

    const config = {
      extends: [`stylelint-plugin-rhythmguard/configs/${profile}`],
      // Next.js build output is generated CSS; never lint it.
      ...(stack.nextjs ? { ignoreFiles: ['.next/**', 'out/**', 'node_modules/**'] } : {}),
    };

    const configPath = path.join(process.cwd(), '.stylelintrc.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    process.stdout.write(`\n✓ Wrote ${configPath}\n`);
    process.stdout.write(`\nNext steps:\n`);
    process.stdout.write(`  npx stylelint "src/**/*.css"\n\n`);
  } finally {
    prompter.close();
  }
}

module.exports = { AGENT_TARGETS, detect, installAgents, run, selectProfile };

if (require.main === module) {
  run();
}
